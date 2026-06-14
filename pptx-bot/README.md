# Taqdimot Bot — Telegram orqali AI taqdimot yaratuvchi

Foydalanuvchi mavzu beradi (ixtiyoriy: o'z kontentini yuklaydi), sahifa sonini tanlaydi, to'lov qiladi — bot Claude API yordamida professional `.pptx` taqdimot yaratib yuboradi.

## Imkoniyatlar

- 🎨 13 xil zamonaviy slayd dizayni, 6 rang palitrasi (avtomatik tanlanadi)
- 📑 Har bir taqdimotda kafolatlangan struktura: titul → reja (mundarija) → asosiy bo'limlar → xulosa → foydalanilgan adabiyotlar (AI unutsa ham tizim o'zi joylashtiradi)
- 📝 Mavzu + ixtiyoriy sahifa soni (inline tugmalar yoki qo'lda kiritish, 6–20)
- 📎 Kontent: foydalanuvchi `.docx`/`.txt`/`.pdf` yoki matn yuborsa — slaydlar shunga asoslanadi; aks holda AI o'zi yozadi
- 💳 To'lov: **manual** (karta + chek → admin tasdiq) va **avtomatik** (Click, Payme)
- 🤖 AI provayder: Anthropic (Claude), OpenAI (GPT), yoki ikkalasi (zaxirali failover) — admin tanlaydi
- 🛠 Admin panel: AI provayder va to'lov usullarini yoqish/o'chirish, narx va karta raqamini o'zgartirish, buyurtmalarni ko'rish
- 🗄 SQLite — foydalanuvchilar, buyurtmalar, sozlamalar saqlanadi

## Foydalanuvchi oqimi

```
/start → 🎨 Taqdimot yaratish → mavzu → sahifa soni →
  kontent (yuklash / AI yozsin) → narx + to'lov usuli →
    manual: karta ko'rsatiladi → chek yuboriladi → admin tasdiqlaydi
    avtomatik: Click/Payme havola → to'lov → webhook tasdiq
  → taqdimot generatsiya qilinadi → foydalanuvchiga .pptx yuboriladi
```

## Texnologiyalar

- Node.js 20+, [grammY](https://grammy.dev) (Telegram bot)
- Anthropic (Claude) va/yoki OpenAI (GPT) — provayder admin tomonidan tanlanadi
- pptxgenjs (.pptx), react-icons + sharp (ikonkalar), mammoth/pdf-parse (kontent)
- better-sqlite3 (ma'lumotlar bazasi), express (to'lov webhooklari)
- **LibreOffice KERAK EMAS** — `.pptx` toza JS bilan yaratiladi

## O'rnatish (mahalliy)

```bash
npm install
cp .env.example .env     # va qiymatlarni to'ldiring
npm start
```

## Muhit o'zgaruvchilari (.env)

Majburiy: `BOT_TOKEN`, `ANTHROPIC_API_KEY`, `ADMIN_IDS` (vergul bilan).
Qolganlari `.env.example` da izohlangan (narx, karta, to'lov usullari, Click/Payme).

`ADMIN_IDS` ni bilish uchun: botga yozing va `@userinfobot` dan o'z Telegram ID'ingizni oling.

## Railway'ga joylash

1. Loyihani GitHub'ga yuklang.
2. Railway → New Project → Deploy from GitHub repo.
3. Railway `Dockerfile` ni avtomatik aniqlaydi (yoki Settings → Build'da tanlang).
4. **Variables** bo'limida `.env.example` dagi o'zgaruvchilarni qo'shing.
5. **Volume** ulang: Settings → Volumes → mount path `/data`, va `DB_PATH=/data/bot.sqlite` qiling (aks holda redeploy'da baza o'chadi).
6. Avtomatik to'lov uchun `PUBLIC_URL` ni Railway bergan domenga moslang (mas. `https://yourapp.up.railway.app`).
7. Deploy. Bot long-polling'da ishlaydi; webhook URL'lar to'lov tizimlari uchun ochiq bo'ladi.

## To'lov tizimlari

### Manual (karta + chek)
To'liq ishlaydi. Admin botdan karta raqamini o'rnatadi. Foydalanuvchi to'lab, chek (rasm) yuboradi. Adminlar chekni "✅ Tasdiqlash / ❌ Rad etish" tugmalari bilan oladi. Tasdiqlangach taqdimot avtomatik yaratiladi.

### Click (avtomatik)
`CLICK_ENABLED=true` + merchant ma'lumotlari kerak. Click panelida webhook URL:
```
https://<PUBLIC_URL>/payments/click
```
Click "Prepare" (action=0) va "Complete" (action=1) so'rovlarini shu manzilga yuboradi. Imzo (md5) `CLICK_SECRET_KEY` bilan tekshiriladi.
⚠️ Haqiqiy merchant hisobi va Click **sandbox** sinovi talab etiladi.

### Payme (avtomatik)
`PAYME_ENABLED=true` + merchant ma'lumotlari kerak. Payme kabinetida endpoint:
```
https://<PUBLIC_URL>/payments/payme
```
JSON-RPC metodlari amalga oshirilgan: CheckPerformTransaction, CreateTransaction, PerformTransaction, CancelTransaction, CheckTransaction. Avtorizatsiya: Basic `Paycom:PAYME_KEY`. Summalar **tiyin**da (so'm × 100).
⚠️ Haqiqiy merchant hisobi va Payme **sandbox** sinovi talab etiladi.

Admin istalgan vaqtda botdagi 🛠 Admin panel orqali har bir to'lov usulini yoqib/o'chirib qo'yishi mumkin.

## Fayl tuzilishi

```
pptx-bot/
├── Dockerfile
├── .env.example
├── package.json
├── README.md
└── src/
    ├── bot.js              # asosiy bot, suhbat oqimi, admin
    ├── config.js           # muhit o'zgaruvchilari
    ├── db.js               # SQLite (users/orders/settings)
    ├── pricing.js          # narx hisoblash
    ├── server.js           # express: to'lov webhooklari + health
    ├── content/extract.js  # docx/txt/pdf dan matn ajratish
    ├── payments/
    │   ├── fulfill.js      # to'lovdan keyin generatsiya+yuborish
    │   ├── click.js        # Click integratsiyasi
    │   └── payme.js        # Payme integratsiyasi
    │                       # (manual to'lov oqimi bot.js ichida)
    └── generator/          # taqdimot generatori (13 layout, 6 palitra)
        ├── theme.js
        ├── icons.js
        ├── layouts.js      # 13 dizayn (agenda/Reja ham)
        ├── prompt.js       # umumiy prompt + JSON parse
        ├── anthropic.js    # Anthropic (Claude) backend
        ├── openai.js       # OpenAI (GPT) backend
        ├── llm.js          # provayder tanlovi + failover
        └── build.js        # JSON → .pptx; mavzu → generatsiya
```

## Eslatmalar

- API kalitlari hech qachon kodga yozilmaydi — `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` orqali.
- AI provayderni admin panel orqali tanlash mumkin (Anthropic / OpenAI / ikkalasi).
- Suhbat oqimi holati xotirada saqlanadi; buyurtmalar/to'lovlar SQLite'da (doimiy).
- Ikonkalar birinchi ishga tushishda generatsiya qilinadi va keshlanadi.
- Kontent yuklansa, slaydlar aynan shu matn asosida tuziladi; aks holda AI mavzudan yaratadi.
