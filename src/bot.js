// src/bot.js
const fs = require("fs");
const path = require("path");
const { Bot, session, InlineKeyboard, Keyboard, InputFile } = require("grammy");
const { config, assertConfig } = require("./config");
const db = require("./db");
const { calcPrice, currency, formatAmount } = require("./pricing");
const { extractText, cleanText } = require("./content/extract");
const fulfill = require("./payments/fulfill");
const click = require("./payments/click");
const payme = require("./payments/payme");
const { startServer } = require("./server");

assertConfig();
db.seedDefaults(config.defaults);

const bot = new Bot(config.botToken);
fulfill.init(bot);

bot.use(session({ initial: () => ({ step: "idle", draft: {} }) }));

const isAdmin = (id) => config.adminIds.includes(id);

// ============ MENYULAR ============
function mainMenu(adminFlag) {
  const kb = new Keyboard()
    .text("🎨 Taqdimot yaratish").row()
    .text("📂 Mening buyurtmalarim").text("ℹ️ Yordam").row();
  if (adminFlag) kb.text("🛠 Admin panel").row();
  return kb.resized();
}

function slidesInline() {
  const kb = new InlineKeyboard();
  [8, 10, 12, 14].forEach((n, i) => { kb.text(`${n}`, `slides:${n}`); if (i % 2 === 1) kb.row(); });
  kb.row().text("✏️ Boshqa son kiritish", "slides:custom");
  return kb;
}

function contentInline() {
  return new InlineKeyboard()
    .text("📎 Kontent yuklayman", "content:yes").row()
    .text("🤖 AI o'zi yozsin", "content:no");
}

function paymentMethodsInline() {
  const kb = new InlineKeyboard();
  if (db.getSetting("manual_enabled") === "1") kb.text("💳 Karta orqali (chek bilan)", "pay:manual").row();
  if (db.getSetting("click_enabled") === "1" && config.click.serviceId) kb.text("🟢 Click", "pay:click").row();
  if (db.getSetting("payme_enabled") === "1" && config.payme.merchantId) kb.text("🔵 Payme", "pay:payme").row();
  return kb;
}

// ============ /start ============
bot.command("start", async (ctx) => {
  db.upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);
  ctx.session.step = "idle";
  ctx.session.draft = {};
  await ctx.reply(
    `Assalomu alaykum, ${ctx.from.first_name || "do'st"}! 👋\n\n` +
    `Men professional taqdimot (PowerPoint) yaratuvchi botman.\n\n` +
    `Mavzu bering, sahifa sonini tanlang — men siz uchun chiroyli, zamonaviy slaydlar tayyorlab beraman.\n\n` +
    `Boshlash uchun pastdagi menyudan foydalaning 👇`,
    { reply_markup: mainMenu(isAdmin(ctx.from.id)) }
  );
});

bot.command("cancel", async (ctx) => {
  ctx.session.step = "idle";
  ctx.session.draft = {};
  await ctx.reply("Bekor qilindi. Bosh menyu:", { reply_markup: mainMenu(isAdmin(ctx.from.id)) });
});

// ============ ASOSIY MENYU TUGMALARI ============
bot.hears("🎨 Taqdimot yaratish", async (ctx) => {
  ctx.session.step = "await_topic";
  ctx.session.draft = {};
  await ctx.reply("📝 Taqdimot mavzusini yozing:\n\n_Masalan: \"Quyosh energetikasi va uning istiqbollari\"_",
    { parse_mode: "Markdown" });
});

bot.hears("📂 Mening buyurtmalarim", async (ctx) => {
  const orders = db.listOrdersByUser(ctx.from.id, 10);
  if (!orders.length) return ctx.reply("Sizda hali buyurtmalar yo'q.");
  const lines = orders.map((o) => {
    const st = statusLabel(o.status);
    return `#${o.id} — ${o.topic.slice(0, 30)} (${o.slides} slayd) — ${st}`;
  });
  await ctx.reply("📂 Buyurtmalaringiz:\n\n" + lines.join("\n"));
});

bot.hears("ℹ️ Yordam", async (ctx) => {
  await ctx.reply(
    "ℹ️ *Qanday ishlaydi:*\n\n" +
    "1️⃣ \"Taqdimot yaratish\" tugmasini bosing\n" +
    "2️⃣ Mavzuni yozing\n" +
    "3️⃣ Sahifa sonini tanlang\n" +
    "4️⃣ Xohlasangiz o'z kontentingizni (matn/fayl) yuklang, yoki AI o'zi yozsin\n" +
    "5️⃣ To'lovni amalga oshiring\n" +
    "6️⃣ Tayyor taqdimotni qabul qiling (.pptx)\n\n" +
    "Bekor qilish uchun /cancel",
    { parse_mode: "Markdown" }
  );
});

// ============ ADMIN PANEL ============
bot.hears("🛠 Admin panel", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply("🛠 Admin panel:", { reply_markup: adminInline() });
});

function adminInline() {
  const man = db.getSetting("manual_enabled") === "1" ? "✅" : "❌";
  const cli = db.getSetting("click_enabled") === "1" ? "✅" : "❌";
  const pay = db.getSetting("payme_enabled") === "1" ? "✅" : "❌";
  const prov = providerLabel(db.getSetting("llm_provider", "anthropic"));
  return new InlineKeyboard()
    .text(`🤖 AI provayder: ${prov}`, "adm:provider").row()
    .text(`${man} Karta (chek)`, "adm:toggle:manual_enabled").row()
    .text(`${cli} Click`, "adm:toggle:click_enabled").row()
    .text(`${pay} Payme`, "adm:toggle:payme_enabled").row()
    .text("💰 Narxni o'zgartirish", "adm:price").row()
    .text("💳 Karta raqamini o'zgartirish", "adm:card").row()
    .text("📊 So'nggi buyurtmalar", "adm:orders");
}

function providerLabel(p) {
  return ({ anthropic: "Anthropic", openai: "OpenAI", both: "Ikkalasi (zaxirali)" })[p] || p;
}

function providerInline() {
  const cur = db.getSetting("llm_provider", "anthropic");
  const mark = (p) => (cur === p ? "🔘 " : "⚪️ ");
  return new InlineKeyboard()
    .text(`${mark("anthropic")}Faqat Anthropic (Claude)`, "adm:setprov:anthropic").row()
    .text(`${mark("openai")}Faqat OpenAI (GPT)`, "adm:setprov:openai").row()
    .text(`${mark("both")}Ikkalasi — biri ishlamasa ikkinchisi`, "adm:setprov:both").row()
    .text("⬅️ Orqaga", "adm:back");
}

bot.callbackQuery(/^adm:toggle:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  const key = ctx.match[1];
  const cur = db.getSetting(key) === "1" ? "0" : "1";
  db.setSetting(key, cur);
  await ctx.answerCallbackQuery(cur === "1" ? "Yoqildi" : "O'chirildi");
  await ctx.editMessageReplyMarkup({ reply_markup: adminInline() });
});

bot.callbackQuery("adm:provider", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const note = providerKeyNote();
  await ctx.editMessageText(
    "🤖 *AI provayderni tanlang:*\n\n" +
    "• *Faqat Anthropic* — barcha taqdimotlar Claude bilan yaratiladi.\n" +
    "• *Faqat OpenAI* — barchasi GPT bilan.\n" +
    "• *Ikkalasi* — avval Anthropic, agar u ishlamasa avtomatik OpenAI'ga o'tadi (zaxira).\n" +
    note,
    { parse_mode: "Markdown", reply_markup: providerInline() }
  );
});

bot.callbackQuery(/^adm:setprov:(anthropic|openai|both)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  const p = ctx.match[1];
  // kalit mavjudligini ogohlantirish
  if ((p === "anthropic" || p === "both") && !config.anthropicApiKey)
    return ctx.answerCallbackQuery({ text: "ANTHROPIC_API_KEY o'rnatilmagan!", show_alert: true });
  if ((p === "openai" || p === "both") && !config.openaiApiKey)
    return ctx.answerCallbackQuery({ text: "OPENAI_API_KEY o'rnatilmagan!", show_alert: true });
  db.setSetting("llm_provider", p);
  await ctx.answerCallbackQuery("Saqlandi: " + providerLabel(p));
  await ctx.editMessageReplyMarkup({ reply_markup: providerInline() });
});

bot.callbackQuery("adm:back", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🛠 Admin panel:", { reply_markup: adminInline() });
});

function providerKeyNote() {
  const a = config.anthropicApiKey ? "✅" : "❌";
  const o = config.openaiApiKey ? "✅" : "❌";
  return `\nKalitlar holati:  Anthropic ${a}   OpenAI ${o}`;
}

bot.callbackQuery("adm:price", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_price";
  await ctx.answerCallbackQuery();
  await ctx.reply(`Hozirgi: bazaviy ${db.getSetting("base_price")} + har slayd ${db.getSetting("price_per_slide")} ${currency()}\n\n` +
    `Yangi qiymatni shu formatda yuboring: \`bazaviy per_slide\`\nMasalan: \`0 5000\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("adm:card", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_card";
  await ctx.answerCallbackQuery();
  await ctx.reply(`Hozirgi karta: ${db.getSetting("card_number")} (${db.getSetting("card_holder")})\n\n` +
    `Yangi karta ma'lumotini shu formatda yuboring:\n\`8600123412341234 Familiya Ism\``, { parse_mode: "Markdown" });
});

bot.callbackQuery("adm:orders", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const orders = db.listRecentOrders(15);
  if (!orders.length) return ctx.reply("Buyurtmalar yo'q.");
  const lines = orders.map((o) => `#${o.id} | ${statusLabel(o.status)} | ${o.slides}sl | ${formatAmount(o.amount)} | tg:${o.user_tg_id}`);
  await ctx.reply("📊 So'nggi buyurtmalar:\n\n" + lines.join("\n"));
});

// ============ SLAYD TANLASH ============
bot.callbackQuery(/^slides:(.+)$/, async (ctx) => {
  if (ctx.session.step !== "await_slides") return ctx.answerCallbackQuery();
  const val = ctx.match[1];
  await ctx.answerCallbackQuery();
  if (val === "custom") {
    ctx.session.step = "await_custom_slides";
    return ctx.reply(`Sahifa sonini yozing (${config.minSlides}–${config.maxSlides} oralig'ida):`);
  }
  const n = parseInt(val, 10);
  ctx.session.draft.slides = n;
  ctx.session.step = "await_content_choice";
  await ctx.editMessageText(`✅ Sahifa soni: ${n}`);
  await askContent(ctx);
});

async function askContent(ctx) {
  await ctx.reply(
    "📎 Taqdimot kontentini o'zingiz beradingizmi yoki AI o'zi yozsinmi?\n\n" +
    "• *Kontent yuklayman* — matn yoki .docx/.txt/.pdf fayl yuborasiz, slaydlar shunga asoslanadi.\n" +
    "• *AI o'zi yozsin* — mavzudan to'liq avtomatik yaratiladi.",
    { parse_mode: "Markdown", reply_markup: contentInline() }
  );
}

bot.callbackQuery(/^content:(yes|no)$/, async (ctx) => {
  if (ctx.session.step !== "await_content_choice") return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  if (ctx.match[1] === "yes") {
    ctx.session.step = "await_content_upload";
    await ctx.editMessageText("📎 Endi kontentni yuboring: matn yozing yoki .docx/.txt/.pdf fayl jo'nating.");
  } else {
    ctx.session.draft.has_content = false;
    ctx.session.draft.content_text = "";
    await ctx.editMessageText("🤖 AI mavzudan o'zi yozadi.");
    await showPriceAndPay(ctx);
  }
});

// ============ MATN KIRITISH (mavzu, custom slayd, kontent, admin) ============
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const step = ctx.session.step;

  // menyu tugmalari allaqachon yuqorida ushlangan; bu yerda faqat oqim
  if (step === "await_topic") {
    if (text.length < 3) return ctx.reply("Mavzu juda qisqa. Iltimos to'liqroq yozing.");
    ctx.session.draft.topic = text;
    ctx.session.step = "await_slides";
    return ctx.reply("📄 Necha sahifalik taqdimot kerak?", { reply_markup: slidesInline() });
  }

  if (step === "await_custom_slides") {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < config.minSlides || n > config.maxSlides) {
      return ctx.reply(`Iltimos ${config.minSlides} dan ${config.maxSlides} gacha son kiriting.`);
    }
    ctx.session.draft.slides = n;
    ctx.session.step = "await_content_choice";
    await ctx.reply(`✅ Sahifa soni: ${n}`);
    return askContent(ctx);
  }

  if (step === "await_content_upload") {
    const cleaned = cleanText(text);
    if (cleaned.length < 20) return ctx.reply("Kontent juda qisqa. Ko'proq matn yuboring yoki fayl jo'nating.");
    ctx.session.draft.has_content = true;
    ctx.session.draft.content_text = cleaned;
    await ctx.reply("✅ Kontent qabul qilindi.");
    return showPriceAndPay(ctx);
  }

  if (step === "admin_price" && isAdmin(ctx.from.id)) {
    const [b, p] = text.split(/\s+/).map((x) => parseInt(x, 10));
    if (!Number.isFinite(b) || !Number.isFinite(p)) return ctx.reply("Format: `bazaviy per_slide`, masalan `0 5000`", { parse_mode: "Markdown" });
    db.setSetting("base_price", b); db.setSetting("price_per_slide", p);
    ctx.session.step = "idle";
    return ctx.reply(`✅ Narx yangilandi: ${b} + ${p}/slayd ${currency()}`);
  }

  if (step === "admin_card" && isAdmin(ctx.from.id)) {
    const m = text.match(/^(\d[\d\s]+\d)\s+(.+)$/);
    if (!m) return ctx.reply("Format: `karta_raqami Familiya Ism`", { parse_mode: "Markdown" });
    db.setSetting("card_number", m[1].trim()); db.setSetting("card_holder", m[2].trim());
    ctx.session.step = "idle";
    return ctx.reply(`✅ Karta yangilandi: ${m[1].trim()} (${m[2].trim()})`);
  }

  // hech qaysi oqimda emas
  if (step === "idle") {
    return ctx.reply("Menyudan tanlang 👇", { reply_markup: mainMenu(isAdmin(ctx.from.id)) });
  }
});

// ============ FAYL (kontent) ============
bot.on("message:document", async (ctx) => {
  if (ctx.session.step !== "await_content_upload") return;
  const doc = ctx.message.document;
  const name = doc.file_name || "file";
  const ext = path.extname(name).toLowerCase();
  if (![".txt", ".md", ".csv", ".docx", ".pdf"].includes(ext)) {
    return ctx.reply("Faqat .txt, .docx yoki .pdf qabul qilinadi. Yoki matnni to'g'ridan-to'g'ri yozing.");
  }
  if (doc.file_size > 15 * 1024 * 1024) return ctx.reply("Fayl juda katta (maks 15MB).");

  await ctx.reply("⏳ Fayl o'qilmoqda...");
  try {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const tmpDir = path.join(__dirname, "..", "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${ctx.from.id}_${Date.now()}${ext}`);
    const resp = await fetch(url);
    const buf = Buffer.from(await resp.arrayBuffer());
    fs.writeFileSync(tmpPath, buf);

    const raw = await extractText(tmpPath, name);
    fs.unlink(tmpPath, () => {});
    const cleaned = cleanText(raw);
    if (cleaned.length < 20) return ctx.reply("Fayldan yetarli matn topilmadi. Boshqa fayl yoki matn yuboring.");
    ctx.session.draft.has_content = true;
    ctx.session.draft.content_text = cleaned;
    await ctx.reply(`✅ Fayldan ${cleaned.length} belgi matn olindi.`);
    return showPriceAndPay(ctx);
  } catch (e) {
    return ctx.reply("⚠️ " + (e.message || "Faylni o'qishda xato."));
  }
});

// ============ NARX + TO'LOV ============
async function showPriceAndPay(ctx) {
  const d = ctx.session.draft;
  const amount = calcPrice(d.slides);
  d.amount = amount;
  ctx.session.step = "await_payment_method";

  const methods = paymentMethodsInline();
  if (methods.inline_keyboard.flat().length === 0) {
    // hech qaysi to'lov yoqilmagan
    return ctx.reply("⚠️ Hozircha to'lov usullari mavjud emas. Administrator bilan bog'laning.");
  }

  await ctx.reply(
    `🧾 *Buyurtma tafsilotlari:*\n\n` +
    `📌 Mavzu: ${d.topic}\n` +
    `📄 Sahifalar: ${d.slides} ta\n` +
    `📎 Kontent: ${d.has_content ? "siz bergan matn asosida" : "AI yaratadi"}\n\n` +
    `💰 *Narx: ${formatAmount(amount)} ${currency()}*\n\n` +
    `To'lov usulini tanlang:`,
    { parse_mode: "Markdown", reply_markup: methods }
  );
}

bot.callbackQuery(/^pay:(manual|click|payme)$/, async (ctx) => {
  if (ctx.session.step !== "await_payment_method") return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const method = ctx.match[1];
  const d = ctx.session.draft;

  // buyurtmani DB ga yozish
  const orderId = db.createOrder({
    user_tg_id: ctx.from.id, topic: d.topic, slides: d.slides,
    has_content: d.has_content, content_text: d.content_text,
    amount: d.amount, currency: currency(), status: "awaiting_payment", payment_method: method,
  });
  ctx.session.draft.orderId = orderId;

  if (method === "manual") {
    ctx.session.step = "await_receipt";
    const cardNum = db.getSetting("card_number") || "— (sozlamada karta raqami yo'q)";
    const cardHolder = db.getSetting("card_holder") || "— (sozlamada ism yo'q)";
    console.log(`[pay:manual] Buyurtma #${orderId} — karta: ${cardNum}, holder: ${cardHolder}`);
    await ctx.editMessageText(
      `💳 *Karta orqali to'lov*\n\n` +
      `Quyidagi kartaga *${formatAmount(d.amount)} ${currency()}* o'tkazing:\n\n` +
      `\`${cardNum}\`\n` +
      `${cardHolder}\n\n` +
      `To'lovdan so'ng *chek/skrinshot* (rasm) yuboring. Administrator tasdiqlagach, taqdimot tayyorlanadi.\n\n` +
      `Buyurtma raqami: *#${orderId}*`,
      { parse_mode: "Markdown" }
    );
  } else if (method === "click") {
    const url = click.buildPaymentUrl(orderId, d.amount);
    db.updateOrder(orderId, { payment_method: "click" });
    ctx.session.step = "idle";
    await ctx.editMessageText(
      `🟢 *Click orqali to'lov*\n\nBuyurtma #${orderId} — ${formatAmount(d.amount)} ${currency()}\n\n` +
      `To'lash uchun havola:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("💳 To'lash", url) }
    );
    await ctx.reply("To'lov tasdiqlangach, taqdimot avtomatik yuboriladi.");
  } else if (method === "payme") {
    const url = payme.buildPaymentUrl(orderId, d.amount);
    db.updateOrder(orderId, { payment_method: "payme" });
    ctx.session.step = "idle";
    await ctx.editMessageText(
      `🔵 *Payme orqali to'lov*\n\nBuyurtma #${orderId} — ${formatAmount(d.amount)} ${currency()}\n\n` +
      `To'lash uchun havola:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("💳 To'lash", url) }
    );
    await ctx.reply("To'lov tasdiqlangach, taqdimot avtomatik yuboriladi.");
  }
});

// ============ CHEK (rasm) — manual to'lov ============
bot.on("message:photo", async (ctx) => {
  if (ctx.session.step !== "await_receipt") {
    // Admin o'zi zakaz qilib, chek yuborayotgan bo'lishi mumkin — step qayta tekshiriladi
    console.log(`[photo] step="${ctx.session.step}" userId=${ctx.from.id} — await_receipt emas, o'tkazib yuborildi`);
    return;
  }
  const orderId = ctx.session.draft.orderId;
  if (!orderId) {
    console.log(`[photo] orderId topilmadi — session.draft:`, JSON.stringify(ctx.session.draft));
    return ctx.reply("Buyurtma raqami topilmadi. /start bilan qaytadan boshlang.");
  }
  const order = db.getOrder(orderId);
  if (!order) return ctx.reply("Buyurtma topilmadi. /start bilan qaytadan boshlang.");

  db.updateOrder(orderId, { status: "awaiting_approval" });
  ctx.session.step = "idle";

  const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const cap =
    `🧾 *Yangi to'lov cheki*\n\n` +
    `Buyurtma: #${orderId}\n` +
    `Mavzu: ${order.topic}\n` +
    `Slaydlar: ${order.slides} ta\n` +
    `Summa: ${formatAmount(order.amount)} ${currency()}\n` +
    `Foydalanuvchi: ${ctx.from.first_name} (@${ctx.from.username || "—"}, id:${ctx.from.id})`;
  const kb = new InlineKeyboard()
    .text("✅ Tasdiqlash", `approve:${orderId}`)
    .text("❌ Rad etish", `reject:${orderId}`);

  // Adminlarga chekni yuborish
  const userIsAdmin = isAdmin(ctx.from.id);
  let adminNotified = false;

  for (const admin of config.adminIds) {
    try {
      await bot.api.sendPhoto(admin, photo, { caption: cap, parse_mode: "Markdown", reply_markup: kb });
      adminNotified = true;
      console.log(`[photo] Admin ${admin} ga chek yuborildi (buyurtma #${orderId})`);
    } catch (e) {
      console.error(`[photo] Admin ${admin} ga yuborishda XATO:`, e.message);
    }
  }

  // Admin o'zi zakaz qilgan holat: tasdiqlash tugmalarini bevosita ko'rsatish
  if (userIsAdmin) {
    await ctx.reply(
      `✅ Chek qabul qilindi.\n\nAdmin sifatida buyurtma #${orderId} ni to'g'ridan tasdiqlashingiz mumkin:`,
      { reply_markup: kb }
    );
  } else {
    await ctx.reply("✅ Chek qabul qilindi. Administrator tekshirib, tasdiqlaydi. Iltimos kuting ⏳");
  }

  // Agar hech qaysi adminga yuborib bo'lmagan bo'lsa — logga yoz
  if (!adminNotified) {
    console.error(`[photo] DIQQAT: Hech qaysi adminga yuborib bo'lmadi. adminIds=${JSON.stringify(config.adminIds)}`);
  }
});

// ============ ADMIN TASDIQ/RAD ============
bot.callbackQuery(/^approve:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const orderId = parseInt(ctx.match[1], 10);
  const order = db.getOrder(orderId);
  if (!order) return ctx.answerCallbackQuery("Buyurtma topilmadi");
  if (order.status === "done" || order.status === "paid" || order.status === "generating")
    return ctx.answerCallbackQuery("Allaqachon ishlangan");
  await ctx.answerCallbackQuery("Tasdiqlandi ✅");
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + `\n\n✅ TASDIQLANDI (admin: ${ctx.from.id})` });
  db.updateOrder(orderId, { status: "paid" });
  fulfill.fulfillOrder(orderId).catch(() => {});
});

bot.callbackQuery(/^reject:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery("Ruxsat yo'q");
  const orderId = parseInt(ctx.match[1], 10);
  const order = db.getOrder(orderId);
  if (!order) return ctx.answerCallbackQuery("Buyurtma topilmadi");
  await ctx.answerCallbackQuery("Rad etildi");
  db.updateOrder(orderId, { status: "rejected" });
  await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + `\n\n❌ RAD ETILDI (admin: ${ctx.from.id})` });
  try { await bot.api.sendMessage(order.user_tg_id, `❌ Buyurtma #${orderId} bo'yicha to'lov tasdiqlanmadi. Iltimos administrator bilan bog'laning yoki qaytadan urinib ko'ring.`); } catch (_) {}
});

// ============ status yorliqlari ============
function statusLabel(s) {
  return ({
    draft: "qoralama", awaiting_payment: "to'lov kutilmoqda", awaiting_receipt: "chek kutilmoqda",
    awaiting_approval: "tasdiq kutilmoqda", paid: "to'langan", generating: "tayyorlanmoqda",
    done: "✅ tayyor", rejected: "❌ rad etilgan", failed: "⚠️ xato",
  })[s] || s;
}

// ============ xatoliklar ============
bot.catch((err) => {
  console.error("Bot xatosi:", err.error || err);
});

// ============ ishga tushirish ============
async function main() {
  startServer(); // webhooklar uchun HTTP server
  await bot.api.setMyCommands([
    { command: "start", description: "Boshlash / Bosh menyu" },
    { command: "cancel", description: "Joriy amalni bekor qilish" },
  ]);
  console.log("Bot ishga tushdi (long polling).");
  bot.start();
}

main().catch((e) => { console.error(e); process.exit(1); });
