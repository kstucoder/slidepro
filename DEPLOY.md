# DEPLOY — Botni ishga tushirish bo'yicha bosqichma-bosqich qo'llanma

Bu qo'llanma sizni noldan to tayyor ishlayotgan botgacha olib boradi. Tartib bilan bajaring.

---

## 0-QISM. Avval kerak bo'ladigan narsalar (tayyorgarlik)

Deploydan oldin quyidagi 4 ta narsani yig'ib oling. Hammasini bir joyga (masalan bloknotga) yozib qo'ying.

### 0.1. Telegram bot tokeni (BotFather)
1. Telegramda **@BotFather** ni oching.
2. `/newbot` buyrug'ini yuboring.
3. Botga nom bering (masalan: `Taqdimot Yaratuvchi`).
4. Username bering — `_bot` bilan tugashi shart (masalan: `taqdimot_yaratuvchi_bot`).
5. BotFather sizga **token** beradi, masalan:
   `123456789:AAH...xyz`
   👉 Buni saqlang — bu `BOT_TOKEN`.

### 0.2. O'zingizning Telegram ID raqamingiz (admin uchun)
1. Telegramda **@userinfobot** ni oching, `/start` bosing.
2. U sizga `Id: 123456789` ko'rinishida raqam beradi.
   👉 Buni saqlang — bu `ADMIN_IDS`. (Bir nechta admin bo'lsa, vergul bilan: `111,222`)

### 0.3. AI API kaliti (kamida bittasi, ikkalasi ham bo'lsa zo'r)
**Anthropic (Claude):**
1. https://console.anthropic.com ga kiring.
2. **API Keys** → yangi kalit. `sk-ant-...` bilan boshlanadi.
   👉 Bu `ANTHROPIC_API_KEY`.

**OpenAI (GPT) — ixtiyoriy, lekin tavsiya etiladi:**
1. https://platform.openai.com ga kiring.
2. **API keys** → yangi kalit. `sk-...` bilan boshlanadi.
   👉 Bu `OPENAI_API_KEY`.

> Ikkala kalit ham bo'lsa, admin "Ikkalasi" rejimini yoqishi mumkin — biri ishlamasa (server band, xato) bot avtomatik ikkinchisiga o'tadi. Hisoblaringizda balans (credit) bo'lishi kerak.

### 0.4. Karta raqami (manual to'lov uchun)
Pul tushadigan karta raqami va egasining ismi. Masalan: `8600 1234 5678 9012`, `Aliyev Vali`.

### 0.5. Akkauntlar
- **GitHub** akkaunti (kodni saqlash uchun) — github.com
- **Railway** akkaunti — railway.app (Render ham bo'ladi, pastda alohida)

---

## 1-QISM. Kodni GitHub'ga joylash

### 1.1. Loyihani kompyuteringizga oching
`taqdimot-bot.zip` ni yeching (extract). Ichida `pptx-bot` papkasi bo'ladi.

### 1.2. GitHub'da yangi repo yarating
1. github.com → o'ng yuqoridagi **+** → **New repository**.
2. Nom bering (masalan `taqdimot-bot`), **Private** qilib qo'ying (maxfiy).
3. **Create repository**.

### 1.3. Kodni yuklang
Eng oson yo'l (terminalsiz) — GitHub web orqali:
1. Yangi repo sahifasida **uploading an existing file** havolasiga bosing.
2. `pptx-bot` ichidagi BARCHA fayl va papkalarni torting (drag-drop).
3. **Commit changes**.

Terminal bilan ishlaganlar uchun:
```bash
cd pptx-bot
git init
git add .
git commit -m "birinchi versiya"
git branch -M main
git remote add origin https://github.com/SIZNING_USERNAME/taqdimot-bot.git
git push -u origin main
```

> ⚠️ `.env` faylini HECH QACHON GitHub'ga yuklamang (u `.gitignore` da, demak avtomatik chiqarib tashlanadi). Maxfiy ma'lumotlar faqat Railway sozlamalarida bo'ladi.

---

## 2-QISM. Railway'ga deploy qilish

### 2.1. Yangi loyiha
1. railway.app ga kiring (GitHub bilan login qiling).
2. **New Project** → **Deploy from GitHub repo**.
3. Ro'yxatdan `taqdimot-bot` repo'ngizni tanlang.
4. Railway `Dockerfile` ni avtomatik aniqlaydi va qurishni boshlaydi.

### 2.2. Muhit o'zgaruvchilarini (Variables) qo'shish
1. Loyihangizdagi service'ni bosing → **Variables** tab.
2. **Raw Editor** (yoki yangiсини qo'shish) orqali quyidagilarni kiriting:

```
BOT_TOKEN=123456789:AAH...xyz
ADMIN_IDS=123456789

ANTHROPIC_API_KEY=sk-ant-...
MODEL=claude-sonnet-4-6
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
LLM_PROVIDER=anthropic

DB_PATH=/data/bot.sqlite

BASE_PRICE=0
PRICE_PER_SLIDE=5000
CURRENCY=so'm
MIN_SLIDES=6
MAX_SLIDES=20

CARD_NUMBER=8600 1234 5678 9012
CARD_HOLDER=Aliyev Vali

MANUAL_ENABLED=true
CLICK_ENABLED=false
PAYME_ENABLED=false
```

> `OPENAI_API_KEY` bo'lmasa, uni qoldirib keting — bot faqat Anthropic bilan ishlaydi. Ikkalasi bo'lsa, admin panel orqali rejimni tanlaysiz.
> Hozircha Click/Payme'ni `false` qoldiring — avval manual to'lov bilan ishga tushiramiz. Keyin yoqasiz.

### 2.3. Volume ulash (MUHIM — baza saqlanishi uchun)
Bu qadamsiz har redeploy'da buyurtmalar o'chib ketadi.
1. Service → **Settings** (yoki service'ga o'ng tugma) → **Volumes** → **Add Volume**.
2. **Mount path** ga `/data` yozing.
3. Saqlang. (Yuqoridagi `DB_PATH=/data/bot.sqlite` shu volume ichiga yozadi.)

### 2.4. Public domen olish (avtomatik to'lov uchun keyin kerak)
1. Service → **Settings** → **Networking** → **Generate Domain**.
2. Railway sizga manzil beradi, masalan `https://taqdimot-bot-production.up.railway.app`.
3. Bu manzilni **Variables** ga qo'shing:
```
PUBLIC_URL=https://taqdimot-bot-production.up.railway.app
PORT=3000
```

### 2.5. Redeploy
O'zgaruvchilarni qo'shgach, Railway odatda avtomatik qayta deploy qiladi. Bo'lmasa **Deployments** → **Redeploy**.

### 2.6. Loglarni tekshirish
**Deployments** → joriy deploy → **Logs**. Quyidagini ko'rsangiz — hammasi joyida:
```
HTTP server: port 3000
Bot ishga tushdi (long polling).
```

---

## 3-QISM. Botni sinab ko'rish (manual to'lov bilan)

1. Telegramda o'z botingizni oching (`@username_bot`), `/start` bosing.
2. **🎨 Taqdimot yaratish** → mavzu yozing → sahifa sonini tanlang.
3. **🤖 AI o'zi yozsin** ni tanlang (yoki kontent yuklang).
4. Narx va karta raqami ko'rinadi → "to'lov qildim" deb chek (istalgan rasm) yuboring.
5. Admin akkauntingizga (siz!) chek + **✅ Tasdiqlash** tugmasi keladi.
6. **Tasdiqlash** ni bosing → bot taqdimotni yaratib, foydalanuvchiga `.pptx` yuboradi.

Agar shu ishlasa — bot to'liq tayyor. 🎉

### Admin panelni tekshirish
Botda **🛠 Admin panel** tugmasi (faqat sizda ko'rinadi):
- **🤖 AI provayder** — Anthropic / OpenAI / Ikkalasi (zaxirali) ni tanlash
- To'lov usullarini yoqish/o'chirish
- Narxni o'zgartirish (format: `0 5000`)
- Karta raqamini o'zgartirish
- So'nggi buyurtmalarni ko'rish

> **AI provayder rejimlari:**
> • *Faqat Anthropic* — hammasi Claude bilan.
> • *Faqat OpenAI* — hammasi GPT bilan.
> • *Ikkalasi* — avval Anthropic, agar u xato bersa (server band va h.k.) avtomatik OpenAI'ga o'tadi. Eng ishonchli variant, lekin ikkala kalit ham kerak.

---

## 4-QISM. (Ixtiyoriy) Click / Payme avtomatik to'lovni yoqish

Buni faqat **merchant hisobingiz** bo'lsa qiling. Avval manual bilan ishlab turing.

### Click
1. Click bilan shartnoma tuzib, merchant kabinetidan oling: `SERVICE_ID`, `MERCHANT_ID`, `SECRET_KEY`, `MERCHANT_USER_ID`.
2. Click kabinetida **webhook (callback) URL** sifatida quyidagini kiriting:
   ```
   https://SIZNING_PUBLIC_URL/payments/click
   ```
3. Railway Variables'ga qo'shing:
   ```
   CLICK_ENABLED=true
   CLICK_SERVICE_ID=...
   CLICK_MERCHANT_ID=...
   CLICK_SECRET_KEY=...
   CLICK_MERCHANT_USER_ID=...
   ```
4. Redeploy. Avval Click **sandbox** (test muhiti)da sinab ko'ring.

### Payme
1. Payme merchant kabinetidan oling: `MERCHANT_ID` va **kassa kaliti** (`KEY`).
2. Payme kabinetida endpoint sifatida:
   ```
   https://SIZNING_PUBLIC_URL/payments/payme
   ```
3. Railway Variables'ga:
   ```
   PAYME_ENABLED=true
   PAYME_MERCHANT_ID=...
   PAYME_KEY=...
   ```
4. Redeploy. Payme **sandbox**da sinab ko'ring (summalar tiyinda: so'm × 100 — kod buni o'zi qiladi).

So'ng botdagi 🛠 Admin panel'dan Click/Payme'ni yoqib qo'ying.

---

## 5-QISM. Muammolarni hal qilish (troubleshooting)

**Bot javob bermayapti**
- Loglarda `Bot ishga tushdi` bormi? Yo'q bo'lsa `BOT_TOKEN` xato.
- Bitta token bilan ikkita joyda bot ishlamasin (lokal + Railway). Bittasini to'xtating.

**"ADMIN_IDS yetishmaydi" yoki shunga o'xshash xato**
- Variables'da `BOT_TOKEN`, `ANTHROPIC_API_KEY`, `ADMIN_IDS` to'g'ri kiritilganini tekshiring.

**Taqdimot yaratishda xato / "API xatosi"**
- Anthropic hisobingizda balans (credit) bormi? `ANTHROPIC_API_KEY` to'g'rimi?
- Loglardan aniq xatoni o'qing.

**Redeploy'dan keyin buyurtmalar yo'qoldi**
- Volume ulanmagan yoki `DB_PATH` `/data` ichida emas (2.3-bosqich).

**Admin tugmasi ko'rinmayapti**
- `ADMIN_IDS` da aynan sizning Telegram ID'ingiz borligini tekshiring (@userinfobot).

**Build (qurish) xatosi**
- Loglarni o'qing. Dockerfile native kutubxonalarni (sharp, sqlite) o'zi quradi; odatda muammosiz.

---

## Qisqa xulosa (tezkor eslatma)

1. BotFather → token
2. @userinfobot → admin ID
3. console.anthropic.com → API kalit
4. Kodni GitHub'ga
5. Railway → repo'dan deploy
6. Variables (token, key, admin, karta) + Volume `/data`
7. Domen → `PUBLIC_URL`
8. Loglarda "Bot ishga tushdi"
9. Telegramda sinab ko'r → admin tasdiq → tayyor

Omad! Savol bo'lsa, qaysi bosqichda muammo borligini ayting.
