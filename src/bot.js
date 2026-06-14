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

// ============ RUXSATLAR ============
// super admin = env ADMIN_IDS (o'chirib bo'lmaydi, admin ro'yxatini boshqaradi)
const isSuperAdmin = (id) => config.adminIds.includes(id);
// admin = super admin yoki db admin
const isAdmin = (id) => isSuperAdmin(id) || db.isDbAdmin(id);
// bepul foydalanuvchi = admin yoki ro'yxatdagi bepul user
const isFree = (id) => isAdmin(id) || db.isFreeUser(id);

// ============ MENYULAR ============
function mainMenu(id) {
  const kb = new Keyboard().text("🎨 Taqdimot yaratish").row()
    .text("📂 Mening buyurtmalarim").text("ℹ️ Yordam").row();
  if (isFree(id) && !isAdmin(id)) kb.text("🎁 Bepul rejim").row();
  if (isAdmin(id)) kb.text("🛠 Admin panel").row();
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
  const freeNote = isFree(ctx.from.id) ? "\n\n🎁 Sizda *bepul foydalanish* huquqi bor — to'lovsiz taqdimot yaratasiz." : "";
  await ctx.reply(
    `Assalomu alaykum, ${ctx.from.first_name || "do'st"}! 👋\n\n` +
    `Men professional taqdimot (PowerPoint) yaratuvchi botman.\n\n` +
    `Mavzu bering, sahifa sonini tanlang — siz uchun chiroyli, zamonaviy slaydlar tayyorlayman.${freeNote}\n\n` +
    `Boshlash uchun menyudan foydalaning 👇`,
    { parse_mode: "Markdown", reply_markup: mainMenu(ctx.from.id) }
  );
});

bot.command("cancel", async (ctx) => {
  ctx.session.step = "idle"; ctx.session.draft = {};
  await ctx.reply("Bekor qilindi. Bosh menyu:", { reply_markup: mainMenu(ctx.from.id) });
});

bot.command("id", async (ctx) => {
  await ctx.reply(`Sizning Telegram ID: \`${ctx.from.id}\``, { parse_mode: "Markdown" });
});

// ============ ASOSIY MENYU ============
bot.hears("🎨 Taqdimot yaratish", async (ctx) => {
  ctx.session.step = "await_topic"; ctx.session.draft = {};
  await ctx.reply("📝 Taqdimot mavzusini yozing:\n\n_Masalan: \"Quyosh energetikasi va uning istiqbollari\"_", { parse_mode: "Markdown" });
});

bot.hears("🎁 Bepul rejim", async (ctx) => {
  await ctx.reply("🎁 Sizda bepul foydalanish huquqi bor. \"🎨 Taqdimot yaratish\" tugmasini bosing — to'lovsiz yakunlanadi.");
});

bot.hears("📂 Mening buyurtmalarim", async (ctx) => {
  const orders = db.listOrdersByUser(ctx.from.id, 10);
  if (!orders.length) return ctx.reply("Sizda hali buyurtmalar yo'q.");
  const lines = orders.map((o) => `#${o.id} — ${o.topic.slice(0, 30)} (${o.slides} slayd) — ${statusLabel(o.status)}`);
  await ctx.reply("📂 Buyurtmalaringiz:\n\n" + lines.join("\n"));
});

bot.hears("ℹ️ Yordam", async (ctx) => {
  await ctx.reply(
    "ℹ️ *Qanday ishlaydi:*\n\n" +
    "1️⃣ \"Taqdimot yaratish\" → mavzuni yozing\n" +
    "2️⃣ Sahifa sonini tanlang\n" +
    "3️⃣ O'z kontentingizni yuklang yoki AI o'zi yozsin\n" +
    "4️⃣ To'lovni amalga oshiring (bepul foydalanuvchilar uchun to'lovsiz)\n" +
    "5️⃣ Tayyor taqdimotni (.pptx) qabul qiling\n\n" +
    "Bekor qilish: /cancel\nID'ingizni bilish: /id",
    { parse_mode: "Markdown" }
  );
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
  ctx.session.draft.slides = parseInt(val, 10);
  ctx.session.step = "await_content_choice";
  await ctx.editMessageText(`✅ Sahifa soni: ${val}`);
  await askContent(ctx);
});

async function askContent(ctx) {
  await ctx.reply(
    "📎 Kontentni o'zingiz berasizmi yoki AI o'zi yozsinmi?\n\n" +
    "• *Kontent yuklayman* — matn yoki .docx/.txt/.pdf yuborasiz, slaydlar shunga asoslanadi.\n" +
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
    ctx.session.draft.has_content = false; ctx.session.draft.content_text = "";
    await ctx.editMessageText("🤖 AI mavzudan o'zi yozadi.");
    await proceedToPayment(ctx);
  }
});

// ============ MATN ============
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text.trim();
  const step = ctx.session.step;

  if (step === "await_topic") {
    if (text.length < 3) return ctx.reply("Mavzu juda qisqa. To'liqroq yozing.");
    ctx.session.draft.topic = text;
    ctx.session.step = "await_slides";
    return ctx.reply("📄 Necha sahifalik taqdimot kerak?", { reply_markup: slidesInline() });
  }
  if (step === "await_custom_slides") {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < config.minSlides || n > config.maxSlides)
      return ctx.reply(`Iltimos ${config.minSlides}–${config.maxSlides} oralig'ida son kiriting.`);
    ctx.session.draft.slides = n;
    ctx.session.step = "await_content_choice";
    await ctx.reply(`✅ Sahifa soni: ${n}`);
    return askContent(ctx);
  }
  if (step === "await_content_upload") {
    const cleaned = cleanText(text);
    if (cleaned.length < 20) return ctx.reply("Kontent juda qisqa. Ko'proq matn yuboring yoki fayl jo'nating.");
    ctx.session.draft.has_content = true; ctx.session.draft.content_text = cleaned;
    await ctx.reply("✅ Kontent qabul qilindi.");
    return proceedToPayment(ctx);
  }

  // ---- admin matn kiritishlari ----
  if (step === "admin_price" && isAdmin(ctx.from.id)) {
    const [b, p] = text.split(/\s+/).map((x) => parseInt(x, 10));
    if (!Number.isFinite(b) || !Number.isFinite(p)) return ctx.reply("Format: `bazaviy per_slide`, masalan `0 5000`", { parse_mode: "Markdown" });
    db.setSetting("base_price", b); db.setSetting("price_per_slide", p);
    ctx.session.step = "idle";
    return ctx.reply(`✅ Narx yangilandi: ${b} + ${p}/slayd ${currency()}`, { reply_markup: mainMenu(ctx.from.id) });
  }
  if (step === "admin_card" && isAdmin(ctx.from.id)) {
    const m = text.match(/^([\d\s]{8,})\s+(.+)$/);
    if (!m) return ctx.reply("Format: `karta_raqami Familiya Ism`", { parse_mode: "Markdown" });
    db.setSetting("card_number", m[1].trim()); db.setSetting("card_holder", m[2].trim());
    ctx.session.step = "idle";
    return ctx.reply(`✅ Karta yangilandi: ${m[1].trim()} (${m[2].trim()})`, { reply_markup: mainMenu(ctx.from.id) });
  }
  if (step === "admin_add_admin" && isSuperAdmin(ctx.from.id)) {
    const id = parseInt(text, 10);
    if (!Number.isFinite(id)) return ctx.reply("Telegram ID raqamini yuboring (faqat raqam).");
    db.addAdmin(id, "", ctx.from.id);
    ctx.session.step = "idle";
    return ctx.reply(`✅ Admin qo'shildi: ${id}`, { reply_markup: mainMenu(ctx.from.id) });
  }
  if (step === "admin_del_admin" && isSuperAdmin(ctx.from.id)) {
    const id = parseInt(text, 10);
    if (!Number.isFinite(id)) return ctx.reply("Telegram ID raqamini yuboring.");
    db.removeAdmin(id);
    ctx.session.step = "idle";
    return ctx.reply(`✅ Admin o'chirildi: ${id}`, { reply_markup: mainMenu(ctx.from.id) });
  }
  if (step === "admin_add_free" && isAdmin(ctx.from.id)) {
    const id = parseInt(text, 10);
    if (!Number.isFinite(id)) return ctx.reply("Telegram ID raqamini yuboring.");
    db.addFreeUser(id, "", ctx.from.id);
    ctx.session.step = "idle";
    try { await bot.api.sendMessage(id, "🎁 Sizga bepul taqdimot yaratish huquqi berildi! /start bosing."); } catch (_) {}
    return ctx.reply(`✅ Bepul foydalanuvchi qo'shildi: ${id}`, { reply_markup: mainMenu(ctx.from.id) });
  }
  if (step === "admin_del_free" && isAdmin(ctx.from.id)) {
    const id = parseInt(text, 10);
    if (!Number.isFinite(id)) return ctx.reply("Telegram ID raqamini yuboring.");
    db.removeFreeUser(id);
    ctx.session.step = "idle";
    return ctx.reply(`✅ Bepul huquq olib tashlandi: ${id}`, { reply_markup: mainMenu(ctx.from.id) });
  }

  if (step === "idle") return ctx.reply("Menyudan tanlang 👇", { reply_markup: mainMenu(ctx.from.id) });
});

// ============ FAYL ============
bot.on("message:document", async (ctx) => {
  if (ctx.session.step !== "await_content_upload") return;
  const doc = ctx.message.document;
  const name = doc.file_name || "file";
  const ext = path.extname(name).toLowerCase();
  if (![".txt", ".md", ".csv", ".docx", ".pdf"].includes(ext))
    return ctx.reply("Faqat .txt, .docx yoki .pdf qabul qilinadi. Yoki matnni to'g'ridan yozing.");
  if (doc.file_size > 15 * 1024 * 1024) return ctx.reply("Fayl juda katta (maks 15MB).");

  await ctx.reply("⏳ Fayl o'qilmoqda...");
  try {
    const file = await ctx.getFile();
    const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
    const tmpDir = path.join(__dirname, "..", "tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tmpPath = path.join(tmpDir, `${ctx.from.id}_${Date.now()}${ext}`);
    const resp = await fetch(url);
    fs.writeFileSync(tmpPath, Buffer.from(await resp.arrayBuffer()));
    const raw = await extractText(tmpPath, name);
    fs.unlink(tmpPath, () => {});
    const cleaned = cleanText(raw);
    if (cleaned.length < 20) return ctx.reply("Fayldan yetarli matn topilmadi. Boshqa fayl yoki matn yuboring.");
    ctx.session.draft.has_content = true; ctx.session.draft.content_text = cleaned;
    await ctx.reply(`✅ Fayldan ${cleaned.length} belgi matn olindi.`);
    return proceedToPayment(ctx);
  } catch (e) {
    return ctx.reply("⚠️ " + (e.message || "Faylni o'qishda xato."));
  }
});

// ============ TO'LOV YOKI BEPUL ============
async function proceedToPayment(ctx) {
  const d = ctx.session.draft;
  const amount = isFree(ctx.from.id) ? 0 : calcPrice(d.slides);
  d.amount = amount;

  // BEPUL foydalanuvchi — to'lovsiz darhol yaratish
  if (isFree(ctx.from.id)) {
    const orderId = db.createOrder({
      user_tg_id: ctx.from.id, topic: d.topic, slides: d.slides,
      has_content: d.has_content, content_text: d.content_text,
      amount: 0, currency: currency(), status: "paid", payment_method: "free",
    });
    ctx.session.step = "idle";
    await ctx.reply(`🎁 Bepul rejim — to'lovsiz!\n\n📌 ${d.topic}\n📄 ${d.slides} slayd\n\nTaqdimot tayyorlanmoqda...`);
    fulfill.fulfillOrder(orderId).catch((e) => console.error(e));
    return;
  }

  ctx.session.step = "await_payment_method";
  const methods = paymentMethodsInline();
  if (methods.inline_keyboard.flat().length === 0)
    return ctx.reply("⚠️ Hozircha to'lov usullari mavjud emas. Administrator bilan bog'laning.");

  await ctx.reply(
    `🧾 *Buyurtma tafsilotlari:*\n\n` +
    `📌 Mavzu: ${d.topic}\n📄 Sahifalar: ${d.slides} ta\n📎 Kontent: ${d.has_content ? "siz bergan matn" : "AI yaratadi"}\n\n` +
    `💰 *Narx: ${formatAmount(amount)} ${currency()}*\n\nTo'lov usulini tanlang:`,
    { parse_mode: "Markdown", reply_markup: methods }
  );
}

bot.callbackQuery(/^pay:(manual|click|payme)$/, async (ctx) => {
  if (ctx.session.step !== "await_payment_method") return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const method = ctx.match[1];
  const d = ctx.session.draft;
  const orderId = db.createOrder({
    user_tg_id: ctx.from.id, topic: d.topic, slides: d.slides,
    has_content: d.has_content, content_text: d.content_text,
    amount: d.amount, currency: currency(), status: "awaiting_payment", payment_method: method,
  });
  ctx.session.draft.orderId = orderId;

  if (method === "manual") {
    ctx.session.step = "await_receipt";
    const cardNum = db.getSetting("card_number") || "— (karta sozlanmagan)";
    const cardHolder = db.getSetting("card_holder") || "—";
    console.log(`[pay:manual] #${orderId} karta=${cardNum}`);
    await ctx.editMessageText(
      `💳 *Karta orqali to'lov*\n\nQuyidagi kartaga *${formatAmount(d.amount)} ${currency()}* o'tkazing:\n\n` +
      `\`${cardNum}\`\n${cardHolder}\n\nTo'lovdan so'ng *chek/skrinshot* (rasm) yuboring. Tasdiqlangach taqdimot tayyorlanadi.\n\nBuyurtma: *#${orderId}*`,
      { parse_mode: "Markdown" }
    );
  } else if (method === "click") {
    const url = click.buildPaymentUrl(orderId, d.amount);
    ctx.session.step = "idle";
    await ctx.editMessageText(`🟢 *Click* — #${orderId}, ${formatAmount(d.amount)} ${currency()}\n\nTo'lash uchun havola:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("💳 To'lash", url) });
    await ctx.reply("To'lov tasdiqlangach taqdimot avtomatik yuboriladi.");
  } else if (method === "payme") {
    const url = payme.buildPaymentUrl(orderId, d.amount);
    ctx.session.step = "idle";
    await ctx.editMessageText(`🔵 *Payme* — #${orderId}, ${formatAmount(d.amount)} ${currency()}\n\nTo'lash uchun havola:`,
      { parse_mode: "Markdown", reply_markup: new InlineKeyboard().url("💳 To'lash", url) });
    await ctx.reply("To'lov tasdiqlangach taqdimot avtomatik yuboriladi.");
  }
});

// ============ CHEK (manual) ============
bot.on("message:photo", async (ctx) => {
  if (ctx.session.step !== "await_receipt") {
    console.log(`[photo] step=${ctx.session.step} — await_receipt emas`);
    return;
  }
  const orderId = ctx.session.draft.orderId;
  const order = orderId ? db.getOrder(orderId) : null;
  if (!order) return ctx.reply("Buyurtma topilmadi. /start bilan qaytadan boshlang.");

  db.updateOrder(orderId, { status: "awaiting_approval" });
  ctx.session.step = "idle";

  const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;
  const cap =
    `🧾 *Yangi to'lov cheki*\n\nBuyurtma: #${orderId}\nMavzu: ${order.topic}\nSlaydlar: ${order.slides} ta\n` +
    `Summa: ${formatAmount(order.amount)} ${currency()}\nFoydalanuvchi: ${ctx.from.first_name} (@${ctx.from.username || "—"}, id:${ctx.from.id})`;
  const kb = new InlineKeyboard().text("✅ Tasdiqlash", `approve:${orderId}`).text("❌ Rad etish", `reject:${orderId}`);

  // barcha adminlarga (env + db) yuborish
  const adminIds = [...new Set([...config.adminIds, ...db.listAdmins().map((a) => a.tg_id)])];
  let notified = false;
  for (const admin of adminIds) {
    try { await bot.api.sendPhoto(admin, photo, { caption: cap, parse_mode: "Markdown", reply_markup: kb }); notified = true; }
    catch (e) { console.error(`[photo] admin ${admin} ga yuborishda xato:`, e.message); }
  }
  if (isAdmin(ctx.from.id)) {
    await ctx.reply(`✅ Chek qabul qilindi.\n\nAdmin sifatida #${orderId} ni tasdiqlashingiz mumkin:`, { reply_markup: kb });
  } else {
    await ctx.reply("✅ Chek qabul qilindi. Administrator tekshirib tasdiqlaydi. Iltimos kuting ⏳");
  }
  if (!notified) console.error(`[photo] DIQQAT: adminlarga yuborilmadi. adminIds=${JSON.stringify(adminIds)}`);
});

// ============ TASDIQLASH / RAD (TUZATILGAN) ============
bot.callbackQuery(/^approve:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
  const orderId = parseInt(ctx.match[1], 10);
  const order = db.getOrder(orderId);
  if (!order) return ctx.answerCallbackQuery({ text: "Buyurtma topilmadi", show_alert: true });
  if (["done", "paid", "generating"].includes(order.status))
    return ctx.answerCallbackQuery({ text: "Allaqachon ishlangan ✅", show_alert: true });

  // MUHIM: avval DB yangilanadi va generatsiya boshlanadi, KEYIN xabar tahrirlanadi.
  db.updateOrder(orderId, { status: "paid" });
  await ctx.answerCallbackQuery({ text: "Tasdiqlandi ✅" });
  fulfill.fulfillOrder(orderId).catch((e) => console.error("[approve] fulfill xato:", e.message));

  // xabarni tahrirlash — best-effort (matn yoki rasm bo'lishidan qat'i nazar)
  const mark = `\n\n✅ TASDIQLANDI (admin: ${ctx.from.id})`;
  try {
    if (ctx.callbackQuery.message.caption !== undefined)
      await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + mark });
    else
      await ctx.editMessageText((ctx.callbackQuery.message.text || "Tasdiqlandi") + mark);
  } catch (e) {
    try { await ctx.editMessageReplyMarkup({ reply_markup: undefined }); } catch (_) {}
  }
});

bot.callbackQuery(/^reject:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Ruxsat yo'q", show_alert: true });
  const orderId = parseInt(ctx.match[1], 10);
  const order = db.getOrder(orderId);
  if (!order) return ctx.answerCallbackQuery({ text: "Buyurtma topilmadi", show_alert: true });
  db.updateOrder(orderId, { status: "rejected" });
  await ctx.answerCallbackQuery({ text: "Rad etildi" });
  const mark = `\n\n❌ RAD ETILDI (admin: ${ctx.from.id})`;
  try {
    if (ctx.callbackQuery.message.caption !== undefined)
      await ctx.editMessageCaption({ caption: (ctx.callbackQuery.message.caption || "") + mark });
    else
      await ctx.editMessageText((ctx.callbackQuery.message.text || "Rad etildi") + mark);
  } catch (_) {}
  try { await bot.api.sendMessage(order.user_tg_id, `❌ Buyurtma #${orderId} bo'yicha to'lov tasdiqlanmadi. Administrator bilan bog'laning yoki qayta urinib ko'ring.`); } catch (_) {}
});

// ============ ADMIN PANEL (professional) ============
bot.hears("🛠 Admin panel", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.reply("🛠 *Admin panel*", { parse_mode: "Markdown", reply_markup: adminMain(ctx.from.id) });
});

function adminMain(id) {
  const kb = new InlineKeyboard()
    .text("📊 Buyurtmalar", "adm:orders").row()
    .text("💳 To'lov usullari", "adm:pay").row()
    .text("🤖 AI provayder", "adm:provider").row()
    .text("💰 Narx", "adm:price").text("💳 Karta", "adm:card").row()
    .text("🎁 Bepul foydalanuvchilar", "adm:free").row();
  if (isSuperAdmin(id)) kb.text("👥 Adminlar", "adm:admins").row();
  return kb;
}

// --- Buyurtmalar (tasdiqlangan / tasdiqlanmagan) ---
bot.callbackQuery("adm:orders", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("📊 *Buyurtmalar*", { parse_mode: "Markdown", reply_markup: new InlineKeyboard()
    .text("✅ Tasdiqlangan", "adm:ord:done").row()
    .text("⏳ Tasdiqlanmagan", "adm:ord:pending").row()
    .text("📋 Hammasi", "adm:ord:all").row()
    .text("⬅️ Orqaga", "adm:back") });
});

bot.callbackQuery(/^adm:ord:(done|pending|all)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const kind = ctx.match[1];
  let orders, title;
  if (kind === "done") { orders = db.listOrdersByStatuses(["paid", "generating", "done"], 20); title = "✅ Tasdiqlangan buyurtmalar"; }
  else if (kind === "pending") { orders = db.listOrdersByStatuses(["awaiting_payment", "awaiting_approval", "rejected", "failed"], 20); title = "⏳ Tasdiqlanmagan buyurtmalar"; }
  else { orders = db.listRecentOrders(20); title = "📋 Barcha buyurtmalar"; }

  const body = orders.length
    ? orders.map((o) => `#${o.id} | ${statusLabel(o.status)} | ${o.slides}sl | ${formatAmount(o.amount)} | tg:${o.user_tg_id}\n   ${o.topic.slice(0, 40)}`).join("\n")
    : "Bo'sh.";
  await ctx.editMessageText(`${title}:\n\n${body}`, { reply_markup: new InlineKeyboard().text("⬅️ Orqaga", "adm:orders") });
});

// --- To'lov usullari ---
bot.callbackQuery("adm:pay", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("💳 *To'lov usullari* (bosib yoqing/o'chiring):", { parse_mode: "Markdown", reply_markup: payInline() });
});
function payInline() {
  const man = db.getSetting("manual_enabled") === "1" ? "✅" : "❌";
  const cli = db.getSetting("click_enabled") === "1" ? "✅" : "❌";
  const pay = db.getSetting("payme_enabled") === "1" ? "✅" : "❌";
  return new InlineKeyboard()
    .text(`${man} Karta (chek)`, "adm:toggle:manual_enabled").row()
    .text(`${cli} Click`, "adm:toggle:click_enabled").row()
    .text(`${pay} Payme`, "adm:toggle:payme_enabled").row()
    .text("⬅️ Orqaga", "adm:back");
}
bot.callbackQuery(/^adm:toggle:(.+)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  const key = ctx.match[1];
  db.setSetting(key, db.getSetting(key) === "1" ? "0" : "1");
  await ctx.answerCallbackQuery(db.getSetting(key) === "1" ? "Yoqildi" : "O'chirildi");
  await ctx.editMessageReplyMarkup({ reply_markup: payInline() });
});

// --- AI provayder ---
bot.callbackQuery("adm:provider", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const a = config.anthropicApiKey ? "✅" : "❌", o = config.openaiApiKey ? "✅" : "❌";
  await ctx.editMessageText(
    `🤖 *AI provayderni tanlang:*\n\n• Faqat Anthropic\n• Faqat OpenAI\n• Ikkalasi — biri ishlamasa ikkinchisi\n\nKalitlar: Anthropic ${a}  OpenAI ${o}`,
    { parse_mode: "Markdown", reply_markup: providerInline() });
});
function providerInline() {
  const cur = db.getSetting("llm_provider", "anthropic");
  const m = (p) => (cur === p ? "🔘 " : "⚪️ ");
  return new InlineKeyboard()
    .text(`${m("anthropic")}Anthropic (Claude)`, "adm:setprov:anthropic").row()
    .text(`${m("openai")}OpenAI (GPT)`, "adm:setprov:openai").row()
    .text(`${m("both")}Ikkalasi (zaxirali)`, "adm:setprov:both").row()
    .text("⬅️ Orqaga", "adm:back");
}
bot.callbackQuery(/^adm:setprov:(anthropic|openai|both)$/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  const p = ctx.match[1];
  if ((p === "anthropic" || p === "both") && !config.anthropicApiKey)
    return ctx.answerCallbackQuery({ text: "ANTHROPIC_API_KEY yo'q!", show_alert: true });
  if ((p === "openai" || p === "both") && !config.openaiApiKey)
    return ctx.answerCallbackQuery({ text: "OPENAI_API_KEY yo'q!", show_alert: true });
  db.setSetting("llm_provider", p);
  await ctx.answerCallbackQuery("Saqlandi");
  await ctx.editMessageReplyMarkup({ reply_markup: providerInline() });
});

// --- Narx / Karta ---
bot.callbackQuery("adm:price", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_price"; await ctx.answerCallbackQuery();
  await ctx.reply(`Hozirgi: ${db.getSetting("base_price")} + ${db.getSetting("price_per_slide")}/slayd ${currency()}\n\nYangisini yuboring: \`bazaviy per_slide\` (mas. \`0 5000\`)`, { parse_mode: "Markdown" });
});
bot.callbackQuery("adm:card", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_card"; await ctx.answerCallbackQuery();
  await ctx.reply(`Hozirgi karta: ${db.getSetting("card_number")} (${db.getSetting("card_holder")})\n\nYangisini yuboring: \`8600123412341234 Familiya Ism\``, { parse_mode: "Markdown" });
});

// --- Bepul foydalanuvchilar ---
bot.callbackQuery("adm:free", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  const list = db.listFreeUsers();
  const body = list.length ? list.map((u) => `• ${u.tg_id}${u.username ? " (@" + u.username + ")" : ""}`).join("\n") : "Ro'yxat bo'sh.";
  await ctx.editMessageText(`🎁 *Bepul foydalanuvchilar:*\n\n${body}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard()
    .text("➕ Qo'shish", "adm:free:add").text("➖ O'chirish", "adm:free:del").row()
    .text("⬅️ Orqaga", "adm:back") });
});
bot.callbackQuery("adm:free:add", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_add_free"; await ctx.answerCallbackQuery();
  await ctx.reply("Bepul huquq beriladigan foydalanuvchining Telegram ID raqamini yuboring:");
});
bot.callbackQuery("adm:free:del", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_del_free"; await ctx.answerCallbackQuery();
  await ctx.reply("Bepul huquqdan olib tashlanadigan ID raqamini yuboring:");
});

// --- Adminlar (faqat super admin) ---
bot.callbackQuery("adm:admins", async (ctx) => {
  if (!isSuperAdmin(ctx.from.id)) return ctx.answerCallbackQuery({ text: "Faqat bosh admin", show_alert: true });
  await ctx.answerCallbackQuery();
  const supers = config.adminIds.map((id) => `• ${id} (bosh admin)`);
  const dbAdmins = db.listAdmins().map((a) => `• ${a.tg_id}${a.username ? " (@" + a.username + ")" : ""}`);
  const body = supers.concat(dbAdmins).join("\n") || "Bo'sh.";
  await ctx.editMessageText(`👥 *Adminlar:*\n\n${body}`, { parse_mode: "Markdown", reply_markup: new InlineKeyboard()
    .text("➕ Qo'shish", "adm:admins:add").text("➖ O'chirish", "adm:admins:del").row()
    .text("⬅️ Orqaga", "adm:back") });
});
bot.callbackQuery("adm:admins:add", async (ctx) => {
  if (!isSuperAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_add_admin"; await ctx.answerCallbackQuery();
  await ctx.reply("Yangi admin Telegram ID raqamini yuboring:");
});
bot.callbackQuery("adm:admins:del", async (ctx) => {
  if (!isSuperAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  ctx.session.step = "admin_del_admin"; await ctx.answerCallbackQuery();
  await ctx.reply("O'chiriladigan admin ID raqamini yuboring (bosh adminlarni o'chirib bo'lmaydi):");
});

// --- Orqaga ---
bot.callbackQuery("adm:back", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return ctx.answerCallbackQuery();
  await ctx.answerCallbackQuery();
  await ctx.editMessageText("🛠 *Admin panel*", { parse_mode: "Markdown", reply_markup: adminMain(ctx.from.id) });
});

// ============ status yorliqlari ============
function statusLabel(s) {
  return ({
    draft: "qoralama", awaiting_payment: "to'lov kutilmoqda", awaiting_receipt: "chek kutilmoqda",
    awaiting_approval: "⏳ tasdiq kutilmoqda", paid: "💰 to'langan", generating: "⚙️ tayyorlanmoqda",
    done: "✅ tayyor", rejected: "❌ rad etilgan", failed: "⚠️ xato", free: "🎁 bepul",
  })[s] || s;
}

bot.catch((err) => { console.error("Bot xatosi:", err.error || err); });

async function main() {
  startServer();
  await bot.api.setMyCommands([
    { command: "start", description: "Boshlash / Bosh menyu" },
    { command: "cancel", description: "Joriy amalni bekor qilish" },
    { command: "id", description: "Telegram ID'imni ko'rsatish" },
  ]);
  console.log("Bot ishga tushdi (long polling).");
  console.log("Super adminlar:", config.adminIds.join(", "));
  console.log("Kanal:", config.deliveryChannelId || "(o'rnatilmagan)");
  bot.start();
}
main().catch((e) => { console.error(e); process.exit(1); });
