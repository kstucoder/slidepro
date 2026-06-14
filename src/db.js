// src/db.js
// SQLite (better-sqlite3) — foydalanuvchilar, buyurtmalar, sozlamalar.

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");
const { config } = require("./config");

// DB papkasini yaratish
const dbDir = path.dirname(config.dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS users (
  tg_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  created_at INTEGER
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_tg_id INTEGER,
  topic TEXT,
  slides INTEGER,
  has_content INTEGER DEFAULT 0,
  content_text TEXT,
  amount INTEGER,
  currency TEXT,
  status TEXT,
  payment_method TEXT,
  provider_tx TEXT,
  file_path TEXT,
  created_at INTEGER,
  paid_at INTEGER
);
`);

// ---- settings ----
function getSetting(key, def = null) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : def;
}
function setSetting(key, value) {
  db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .run(key, String(value));
}
function getAllSettings() {
  const rows = db.prepare("SELECT key,value FROM settings").all();
  const o = {};
  rows.forEach((r) => (o[r.key] = r.value));
  return o;
}
// standart qiymatlarni birinchi marta o'rnatish
function seedDefaults(defaults) {
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) === null) setSetting(k, v);
  }
}

// ---- users ----
function upsertUser(tgId, username, firstName) {
  db.prepare(`INSERT INTO users(tg_id,username,first_name,created_at) VALUES(?,?,?,?)
    ON CONFLICT(tg_id) DO UPDATE SET username=excluded.username, first_name=excluded.first_name`)
    .run(tgId, username || "", firstName || "", Date.now());
}

// ---- orders ----
function createOrder(o) {
  const info = db.prepare(`INSERT INTO orders
    (user_tg_id,topic,slides,has_content,content_text,amount,currency,status,payment_method,created_at)
    VALUES(@user_tg_id,@topic,@slides,@has_content,@content_text,@amount,@currency,@status,@payment_method,@created_at)`)
    .run({
      user_tg_id: o.user_tg_id, topic: o.topic, slides: o.slides,
      has_content: o.has_content ? 1 : 0, content_text: o.content_text || null,
      amount: o.amount, currency: o.currency, status: o.status || "draft",
      payment_method: o.payment_method || null, created_at: Date.now(),
    });
  return info.lastInsertRowid;
}
function getOrder(id) {
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
}
function updateOrder(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(`UPDATE orders SET ${set} WHERE id = @id`).run({ ...fields, id });
}
function listOrdersByUser(tgId, limit = 10) {
  return db.prepare("SELECT * FROM orders WHERE user_tg_id = ? ORDER BY id DESC LIMIT ?").all(tgId, limit);
}
function listRecentOrders(limit = 20) {
  return db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT ?").all(limit);
}
function findOrderByProviderTx(tx) {
  return db.prepare("SELECT * FROM orders WHERE provider_tx = ?").get(tx);
}

module.exports = {
  db, getSetting, setSetting, getAllSettings, seedDefaults,
  upsertUser, createOrder, getOrder, updateOrder,
  listOrdersByUser, listRecentOrders, findOrderByProviderTx,
};
