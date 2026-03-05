# GPT Query Extractor — Backend Setup Guide

## 📁 Complete File Structure

```
gptqueryextractor/
│
├── frontend/                   ← All your HTML files
│   ├── index.html
│   ├── login.html
│   ├── dashboard.html
│   ├── pricing.html
│   ├── blog.html
│   ├── contact.html
│   ├── faq.html
│   ├── privacy.html
│   ├── terms.html
│   └── api.js                  ← Copy this here (connects frontend to backend)
│
└── backend/
    ├── server.js               ← Main server
    ├── package.json
    ├── .env                    ← Your secret keys (never share this!)
    │
    ├── config/
    │   └── db.js               ← MongoDB connection
    │
    ├── models/
    │   ├── User.js             ← User schema
    │   ├── Session.js          ← Query sessions schema
    │   └── Contact.js          ← Contact form schema
    │
    ├── routes/
    │   ├── auth.js             ← Login / Signup / Google
    │   ├── dashboard.js        ← Stats & charts
    │   ├── sessions.js         ← Session history CRUD
    │   ├── contact.js          ← Contact form + email
    │   └── payments.js         ← Stripe subscriptions
    │
    └── middleware/
        └── auth.js             ← JWT protection
```

---

## 🚀 Step-by-Step Setup

### STEP 1 — Install Node.js
Download from: https://nodejs.org (choose LTS version)
Verify install:
```
node --version
npm --version
```

### STEP 2 — Set Up MongoDB Atlas (Free Database)
1. Go to https://cloud.mongodb.com
2. Create free account
3. Click **"Build a Database"** → choose **FREE** tier
4. Choose any cloud provider (AWS recommended)
5. Click **"Create"**
6. Set username and password (save these!)
7. Under **"Network Access"** → Add IP → **Allow Access from Anywhere** (0.0.0.0/0)
8. Go to **"Database"** → Click **"Connect"** → **"Connect your application"**
9. Copy the connection string → looks like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
   ```
10. Paste into your `.env` as `MONGO_URI` (replace username/password)

### STEP 3 — Set Up Gmail App Password (for emails)
1. Go to your Google Account → Security
2. Enable **2-Step Verification** (required)
3. Search **"App Passwords"** → Generate password for "Mail"
4. Copy the 16-character password
5. Paste into `.env` as `EMAIL_PASS`
6. Put your Gmail as `EMAIL_USER`

### STEP 4 — Set Up Stripe (for payments)
1. Go to https://dashboard.stripe.com (create free account)
2. Go to **Developers → API Keys**
3. Copy **Secret key** → paste as `STRIPE_SECRET_KEY` in `.env`
4. Go to **Products** → Create products for each plan:
   - Pro Monthly ($9/mo)
   - Pro Annual ($6/mo billed yearly)
   - Agency Monthly ($29/mo)
   - Agency Annual ($20/mo billed yearly)
5. Copy each **Price ID** → paste into `.env`
6. For webhooks: **Developers → Webhooks → Add endpoint**
   - URL: `https://your-backend-url.com/api/payments/webhook`
   - Events: `checkout.session.completed`, `invoice.payment_succeeded`, `invoice.payment_failed`, `customer.subscription.deleted`

### STEP 5 — Install & Run Backend
Open terminal in VS Code, navigate to backend folder:
```bash
cd backend
npm install
npm run dev
```

You should see:
```
╔════════════════════════════════════════╗
║   GPT Query Extractor Backend v1.0.0   ║
╚════════════════════════════════════════╝
🚀 Server running on  : http://localhost:5000
✅ MongoDB Connected: cluster0.xxxxx.mongodb.net
```

### STEP 6 — Add api.js to Your Frontend
Copy `api.js` to your `frontend/` folder.
Add this line to the `<head>` of EVERY HTML page:
```html
<script src="api.js"></script>
```

### STEP 7 — Test the Connection
Open your browser and go to:
```
http://localhost:5000/api/health
```
You should see:
```json
{ "success": true, "message": "🟢 GPT Query Extractor API is running!" }
```

---

## 🔌 API Endpoints Reference

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/signup | Create new account |
| POST | /api/auth/login | Login |
| POST | /api/auth/google | Google OAuth login |
| GET | /api/auth/me | Get logged in user |
| PUT | /api/auth/settings | Update settings |
| POST | /api/auth/forgot-password | Password reset email |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/dashboard/stats | Stats + chart data |
| GET | /api/dashboard/recent | Last 10 sessions |

### Sessions
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/sessions | All sessions (paginated) |
| GET | /api/sessions/:id | Single session |
| POST | /api/sessions | Create new session |
| PUT | /api/sessions/:id/result | Save extracted queries |
| PUT | /api/sessions/:id/status | Pause / resume / stop |
| POST | /api/sessions/:id/export | Export + log format |
| DELETE | /api/sessions/:id | Delete session |
| DELETE | /api/sessions | Clear all sessions |

### Contact
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/contact | Submit contact form |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/payments/create-checkout | Start Stripe checkout |
| GET | /api/payments/subscription | Get subscription status |
| POST | /api/payments/cancel | Cancel subscription |
| POST | /api/payments/webhook | Stripe webhook handler |

---

## 🔒 Environment Variables (.env)

| Variable | Description | Where to get |
|----------|-------------|--------------|
| MONGO_URI | MongoDB connection string | MongoDB Atlas |
| JWT_SECRET | Any long random string | Make it up |
| EMAIL_USER | Your Gmail address | Gmail |
| EMAIL_PASS | Gmail App Password | Google Account Security |
| STRIPE_SECRET_KEY | Stripe secret key | Stripe Dashboard |
| STRIPE_WEBHOOK_SECRET | Stripe webhook secret | Stripe Webhooks |
| STRIPE_PRO_MONTHLY_PRICE_ID | Pro monthly price ID | Stripe Products |

---

## 📦 Deploy Backend (Free on Render.com)

1. Go to https://render.com → free account
2. New → **Web Service** → Connect GitHub repo
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Add all environment variables from `.env`
6. Deploy! Your backend will be live at `https://your-app.onrender.com`
7. Update `FRONTEND_URL` in `.env` to your Netlify URL

---

## ❓ Common Issues

**MongoDB connection fails?**
→ Check your IP is whitelisted in MongoDB Atlas Network Access

**Emails not sending?**
→ Make sure you're using Gmail App Password (not your regular password)

**Stripe webhook not working locally?**
→ Use Stripe CLI: `stripe listen --forward-to localhost:5000/api/payments/webhook`

**CORS errors in browser?**
→ Make sure `FRONTEND_URL` in `.env` matches your Live Server URL exactly
