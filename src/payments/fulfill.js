// src/payments/fulfill.js
// To'lov tasdiqlangach: taqdimotni generatsiya qilib, foydalanuvchiga yuborish.
// Bu modul bot instansiyasiga muhtoj, shuning uchun init(bot) orqali ulanadi.

const fs = require("fs");
const path = require("path");
const { InputFile } = require("grammy");
const { getOrder, updateOrder, getSetting } = require("../db");
const { generatePresentation } = require("../generator/build");
const { config } = require("../config");

let _bot = null;
function init(bot) { _bot = bot; }

function slug(s) {
  return (s || "taqdimot").toLowerCase().replace(/[^a-z0-9\u0400-\u04FF]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "taqdimot";
}

async function fulfillOrder(orderId) {
  const order = getOrder(orderId);
  if (!order) return;
  if (order.status === "done" || order.status === "generating") return; // ikki marta ishlamasin

  updateOrder(orderId, { status: "generating", paid_at: Date.now() });

  try {
    await _bot.api.sendMessage(order.user_tg_id,
      "✅ To'lov tasdiqlandi! Taqdimotingiz tayyorlanmoqda, biroz kuting...");
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

    updateOrder(orderId, { status: "done", file_path: outFile });

    await _bot.api.sendDocument(order.user_tg_id, new InputFile(outFile), {
      caption: `🎉 Taqdimotingiz tayyor!\n\n📌 Mavzu: ${order.topic}\n📄 Slaydlar: ${res.slideCount} ta\n\nBuyurtmangiz uchun rahmat!`,
    });
  } catch (e) {
    updateOrder(orderId, { status: "failed" });
    try {
      await _bot.api.sendMessage(order.user_tg_id,
        "⚠️ Taqdimot yaratishda xatolik yuz berdi. Administrator bilan bog'laning, to'lovingiz qaytariladi yoki qayta urinib ko'riladi.");
    } catch (_) {}
    // adminlarni xabardor qilish
    for (const admin of config.adminIds) {
      try { await _bot.api.sendMessage(admin, `❌ Buyurtma #${orderId} generatsiyada xato: ${e.message}`); } catch (_) {}
    }
  }
}

module.exports = { init, fulfillOrder };
