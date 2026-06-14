// src/pricing.js
const { getSetting } = require("./db");

function calcPrice(slides) {
  const base = parseInt(getSetting("base_price", "0"), 10) || 0;
  const perSlide = parseInt(getSetting("price_per_slide", "5000"), 10) || 0;
  return base + perSlide * slides;
}

function currency() {
  return getSetting("currency", "so'm");
}

function formatAmount(amount) {
  // 60000 -> "60 000"
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

module.exports = { calcPrice, currency, formatAmount };
