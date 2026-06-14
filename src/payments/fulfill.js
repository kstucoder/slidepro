// src/payments/fulfill.js
// To'lov tasdiqlangach: taqdimotni yaratib (yoki keshdan olib), foydalanuvchiga yuborish.
// + Tayyor faylni kanalga joylash. + Bir xil taqdimot qayta so'ralsa keshdan beradi.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { InputFile } = require("grammy");
const { getOrder, updateOrder, getSetting, getCache, setCache } = require("../db");
const { generatePresentation } = require("../generator/build");
const { config } = require("../config");

let _bot = null;
function init(bot) { _bot = bot; }

function slug(s) {
  return (s || "taqdimot").toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "taqdimot";
}

// kesh kaliti: mavzu (normallashtirilgan) + slayd soni + kontent xeshi
function cacheKey(order) {
  const norm = (order.topic || "").trim().toLowerCase().replace(/\s+/g, " ");
  const contentHash = order.content_text
    ? crypto.createHash("md5").update(order.content_text).digest("hex").slice(0, 8)
    : "ai";
  return `${norm}|${order.slides}|${contentHash}`;
}

async function fulfillOrder(orderId) {
  const order = getOrder(orderId);
  if (!order) return;
  if (order.status === "done" || order.status === "generating") return;

  updateOrder(orderId, { status: "generating", paid_at: Date.now() });
  const key = cacheKey(order);

  // 1) KESH TEKSHIRUVI — bir xil taqdimot avval yaratilganmi?
  try {
    const cached = getCache(key);
    if (cached && cached.file_id) {
      await _bot.api.sendDocument(order.user_tg_id, cached.file_id, {
        caption: `🎉 Taqdimotingiz tayyor!\n\n📌 Mavzu: ${order.topic}\n📄 Slaydlar: ${order.slides} ta\n\n(Tezkor yetkazildi)`,
      });
      updateOrder(orderId, { status: "done", file_id: cached.file_id });
      console.log(`[fulfill] #${orderId} KESHDAN yetkazildi (key=${key})`);
      return;
    }
  } catch (e) {
    console.error(`[fulfill] kesh tekshiruvida xato:`, e.message);
  }

  // 2) YANGI GENERATSIYA
  try {
    await _bot.api.sendMessage(order.user_tg_id, "✅ To'lov tasdiqlandi! Taqdimotingiz tayyorlanmoqda, biroz kuting...");
  } catch (e) {}

  const outDir = path.join(__dirname, "..", "..", "output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `order_${orderId}_${slug(order.topic)}.pptx`);

  try {
    const res = await generatePresentation({
      topic: order.topic,
      slides: order.slides,
      sourceContent: order.content_text || "",
      llm: {
        provider: getSetting("llm_provider", "anthropic"),
        anthropicKey: config.anthropicApiKey,
        anthropicModel: config.model,
        openaiKey: config.openaiApiKey,
        openaiModel: config.openaiModel,
      },
      outFile,
    });

    const caption = `🎉 Taqdimot tayyor!\n\n📌 Mavzu: ${order.topic}\n📄 Slaydlar: ${res.slideCount} ta`;

    // 3) KANALGA YUBORISH (kesh uchun file_id olamiz)
    let fileId = null, channelMsgId = null;
    if (config.deliveryChannelId) {
      try {
        const sent = await _bot.api.sendDocument(config.deliveryChannelId, new InputFile(outFile), {
          caption: `🆕 #${orderId} | ${order.topic} | ${res.slideCount} slayd`,
        });
        fileId = sent.document && sent.document.file_id;
        channelMsgId = sent.message_id;
        console.log(`[fulfill] #${orderId} kanalga yuborildi (msg=${channelMsgId})`);
      } catch (e) {
        console.error(`[fulfill] kanalga yuborishda xato:`, e.message);
      }
    }

    // 4) FOYDALANUVCHIGA YUBORISH
    let userSent;
    if (fileId) {
      userSent = await _bot.api.sendDocument(order.user_tg_id, fileId, { caption: `${caption}\n\nBuyurtmangiz uchun rahmat!` });
    } else {
      userSent = await _bot.api.sendDocument(order.user_tg_id, new InputFile(outFile), { caption: `${caption}\n\nBuyurtmangiz uchun rahmat!` });
      fileId = userSent.document && userSent.document.file_id;
    }

    // 5) KESHGA SAQLASH
    if (fileId) {
      try { setCache(key, fileId, order.topic, order.slides, channelMsgId); }
      catch (e) { console.error("[fulfill] kesh saqlashda xato:", e.message); }
    }

    updateOrder(orderId, { status: "done", file_path: outFile, file_id: fileId || null });
    console.log(`[fulfill] #${orderId} muvaffaqiyatli yetkazildi (provider=${res.usedProvider})`);
  } catch (e) {
    updateOrder(orderId, { status: "failed" });
    console.error(`[fulfill] #${orderId} GENERATSIYA XATOSI:`, e.message);
    try {
      await _bot.api.sendMessage(order.user_tg_id, "⚠️ Taqdimot yaratishda xatolik yuz berdi. Administrator bilan bog'laning.");
    } catch (_) {}
    notifyAdmins(`❌ Buyurtma #${orderId} generatsiyada xato: ${e.message}`);
  }
}

function notifyAdmins(text) {
  let ids = [...config.adminIds];
  try { const { listAdmins } = require("../db"); ids = ids.concat(listAdmins().map((a) => a.tg_id)); } catch (_) {}
  ids = [...new Set(ids)];
  for (const id of ids) { _bot.api.sendMessage(id, text).catch(() => {}); }
}

module.exports = { init, fulfillOrder, notifyAdmins, cacheKey };
