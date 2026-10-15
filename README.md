# Taqdimot Bot — Telegram orqali AI yordamida .pptx / .docx yaratuvchi

Bu loyiha — Telegram bot bo‘lib, foydalanuvchidan mavzu va (ixtiyoriy) kontent olib, professional PowerPoint (.pptx) taqdimot yoki mustaqil ish (.docx) yaratadi. To‘lov imkoniyatlari (manual + Click + Payme), admin panel, kesh va bir nechta LLM provayderlari uchun oson sozlash mavjud.

## Asosiy imkoniyatlar

- Taqdimot (.pptx) va mustaqil ish (.docx) yaratish — mavzu va ixtiyoriy kontent asosida.
- 13 ta tayyor slayd layouti va 6 ta rang palitrasi.
- Kirish, Reja (agenda), Xulosa va Foydalanilgan adabiyotlar strukturasi kafolatlangan.
- Kontentni .docx/.txt/.pdf fayldan yoki oddiy matndan olish (mammoth, pdf-parse yordamida).
- To‘lovlar: manual (karta + chek), Click va Payme integratsiyalari.
- AI provayderlar: Anthropic (Claude) va OpenAI (GPT). Failover qo‘llab-quvvatlanadi.
- Kesh: bir xil mavzu/kontent uchun tayyor fayl kanal orqali saqlanadi va qayta ishlatila oladi.
- SQLite orqali buyurtmalar va sozlamalar saqlanadi.

## Texnologiyalar

- Node.js 20+
- grammY (Telegram bot)
- express (webhooklar / health)
- pptxgenjs (PowerPoint yaratish)
- better-sqlite3 (ma'lumotlar bazasi)
- mammoth, pdf-parse (kontentni ajratish)
- sharp (rasm ishlov berish)

## Tez boshlash (mahalliy)

Kloni oling va o‘rnatish:

```bash
git clone https://github.com/kstucoder/slidepro.git
cd slidepro
npm install
cp .env.example .env
# .env faylini tahrirlash: BOT_TOKEN, ANTHROPIC_API_KEY / OPENAI_API_KEY, ADMIN_IDS va to'lov sozlamalari
npm start
```

Bot long-polling orqali ishlaydi va `src/server.js` Expressda to'lov webhooklarini boshqaradi.

## Muhit o'zgaruvchilari (.env)

Quyidagi o‘zgaruvchilar majburiy yoki tavsiya etiladi (batafsil `.env.example`):

- BOT_TOKEN — Telegram bot token
- ANTHROPIC_API_KEY — (ixtiyoriy, lekin tavsiya etiladi)
- OPENAI_API_KEY — (ixtiyoriy, failover uchun)
- ADMIN_IDS — bosh adminlar telegram IDlari (vergul bilan)

To‘lov uchun kerakli sozlamalar (agar Click/Payme kerak bo‘lsa):
- CLICK_ENABLED, CLICK_MERCHANT_ID, CLICK_SECRET_KEY
- PAYME_ENABLED, PAYME_MERCHANT_ID, PAYME_KEY

Delivery va fayl saqlash uchun:
- DELIVERY_CHANNEL_ID — tayyor fayllar yuboriladigan kanal (kesh uchun)
- DB_PATH — agar konteynerda /data ga mount qilinsa, DB_PATH=/data/bot.sqlite tavsiya etiladi

## Docker / Railway

Dockerfile mavjud va Node 20-slim asosida qurilgan.
Agar Railway yoki boshqa PaaS ishlatilsa, Dockerfile avtomatik aniqlanadi.

Docker build & run:

```bash
docker build -t slidepro .
docker run --env-file .env -p 3000:3000 slidepro
```

Railway uchun README ichidagi instruktsiyalarga rioya qiling: Volume mount `/data` va `DB_PATH=/data/bot.sqlite` o‘rnatish juda muhim.

## Fayl tuzilishi

```
pptx-bot/
├── Dockerfile
├── .env.example
├── package.json
├── README.md
└── src/
    ├── bot.js              # asosiy bot, suhbat oqimi, admin
    ├── config.js           # muhit o'zgaruvchilari va validatsiya
    ├── db.js               # SQLite bilan ishlash (orders, users, settings, cache)
    ├── pricing.js          # narx hisoblash formulalari
    ├── server.js           # express: to'lov webhooklari + health
    ├── content/extract.js  # fayllardan matn ajratish (.docx/.pdf/.txt)
    ├── payments/           # Click, Payme, fulfill (to'lov -> generatsiya)
    └── generator/          # .pptx/.docx generator: layouts, icons, LLM orkestratori
```

## Qoidalar: Reja va sahifa taqsimoti (generator siyosati)

Generator quyidagi qoidalarga qat'iy amal qiladi:

- "Kirish", "Xulosa" va "Foydalanilgan adabiyotlar" har biri 1 sahifa bo‘ladi va ularga ichki rejalar (subplans) bo‘lmaydi.
- Asosiy bo‘limlar (main sections) soni: 10 sahifagacha — 3 ta; 10 sahifadan keyin har qo‘shilgan 5 sahifa uchun +1 main bo‘lim.
  - main = 3 + floor( max(0, total_pages - 10) / 5 )
- Ichki rejalar (subsections): har bir ichki reja 1.5 sahifa oladi.
  - available_for_inner = max(0, total_pages - 3)  # Kirish+Xulosa+Adabiyotlar chiqariladi
  - inner = floor( available_for_inner / 1.5 )
- Ichki rejalar main bo‘limlarga imkon qadar teng taqsimlanadi; qoldiq bo‘lsa birinchi bo‘limlarga beriladi.
- REJA (agenda) sahifasi quyidagi formatda yaratiladi:

```
Kirish
1. Reja nomi 1
2. Reja nomi 2
3. Reja nomi 3
...
Xulosa
Foydalanilgan adabiyotlar
```

(Generator ichida `src/generator/llm.js` va `src/generator/build.js` bu qoidalarga moslashtirilgan.)

## Ishlash mantigi (qisqacha)

1. Foydalanuvchi botga mavzu va sahifa/slayd sonini yuboradi.
2. Foydalanuvchi kontent yuklashi mumkin yoki bot AI yordamida kontent yaratadi.
3. To‘lov amalga oshirilgach (yoki bepul rejimda), `fulfill` oqimi generatsiyani boshlaydi:
   - Avval kesh tekshiriladi — agar avval yaratilgan bo‘lsa, mavjud fayl yuboriladi.
   - Aks holda LLM (Anthropic yoki OpenAI) dan spec olinadi va `.pptx` yoki `.docx` yaratiladi.
   - Tayyor fayl kanalga (agar `DELIVERY_CHANNEL_ID` sozlangan bo‘lsa) yuboriladi va userga yetkaziladi.

## Test va rivojlantirish

- Lokal ishga tushirish uchun `npm start` yetarli. Testlar hozir mavjud emas.
- Ikonkalarni oldindan generatsiya qilish uchun `npm run icons` buyruqidan foydalaning.

## Xavfsizlik va maxfiylik

- API kalitlarini hech qachon public repo ga joylamang. Foydalanish uchun `.env` faylidan foydalaning.
- Administrator tokenlari va to‘lov kalitlarini `.env` dan oling.

## Hissa qo'shish

PRlar va muammolar (issues) oching. Kichik o‘zgarishlar uchun branch va pull request orqali yuboring.

## Muallif

kstucoder

---

_Agar istasangiz, READMEni ruscha yoki inglizcha tarjimasini ham qo‘shaman, yoki READMEga tez-tez so‘raladigan savollar (FAQ) va deploy checklist qo‘shib chiqaman._