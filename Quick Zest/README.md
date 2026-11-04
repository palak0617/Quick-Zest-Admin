# QuickZest Admin — internal operations dashboard

Admin-only dashboard for QuickZest premixes: inventory, orders, money in, money out, automatic profit, and a chatbot that answers from your data.

- **server/** — Node.js + Express + MongoDB (Mongoose) API
- **client/** — Next.js (App Router) + Tailwind CSS frontend

## Pages

| Page | What it does |
|---|---|
| **Login** | Email + password, then a 6-digit code from a free **authenticator app** on your phone (Google / Microsoft Authenticator). The first sign-in shows a QR code to link the phone and gives you 8 one-time **backup codes**. 5 wrong codes lock sign-in for 15 minutes. |
| **Dashboard** | Balance, money in/out and net profit this month, dues, stock value, 6-month chart, low stock, recent orders, best sellers. |
| **Inventory** | Add/edit products (cost and selling price, pack size, low-stock alert level). Stock **In / Out / Set exact count**, with a full history of every change. |
| **Orders** | Who ordered, when, items, discount and shipping, with the total and profit calculated automatically. Creating an order takes stock out, and cancelling or deleting it puts stock back. Shows paid / partial / unpaid. |
| **Money In** | Payments received, linked to orders. **"Who received the payment" checkboxes** come from a list the admin manages (add, rename, delete). A **"Money received & verified"** checkbox controls what counts towards balance and profit. |
| **Money Out** | Expenses with admin-managed **categories** (with colours) and a breakdown by category. |
| **Profit & Reports** | Choose a period: money received, money spent, net cash profit, sales, cost of goods, gross profit and margin, operating profit, spending by category, product profit, top customers, and a 12-month table. |
| **Settings** | Business name, opening balance, order number prefix, change password, **move codes to a new phone**, new backup codes. |
| **Chatbot** ("Ask QuickZest", on every page) | For example "How many packets of pasta premix are there?", "low stock", "orders this month", "profit last month", "who hasn't paid", "current balance", "top sellers". It answers from the database with no API key needed. Add `ANTHROPIC_API_KEY` to let it also answer free-form questions using a live snapshot of your data. |

### How the numbers are calculated (automatically)
- **Balance** = opening balance + all verified payments − all expenses
- **Net profit (cash)** = verified money received − money spent (in the period)
- **Gross profit** = order sales − (cost price × quantity sold). The cost and price are saved on each order, so later price changes don't rewrite history.
- **Operating profit** = gross profit − expenses
- **Order payment status** is updated from that order's verified payments.

## Setup (local)

You need **Node.js 18+** and **MongoDB**, either installed locally or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster.

### 1. API
```bash
cd server
npm install
cp .env.example .env        # then edit .env (see below)
npm run seed:admin          # optional: the admin is also auto-created on first start
npm run seed:demo           # optional: sample products, orders, payments, expenses
npm run dev                 # http://localhost:5000
```
In `.env`, set at least:
- `MONGODB_URI`: your local or Atlas connection string
- `JWT_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: the admin login (created automatically on first start).
- Two-factor needs no setup: on first sign-in, scan the QR code with Google or Microsoft Authenticator.
  
To delete the demo data later: `npm run seed:demo -- --reset` wipes all business data (never the admin account) and re-seeds it. To start clean, delete the collections in MongoDB instead.

### 2. Frontend
```bash
cd client
npm install
cp .env.example .env        # API_URL=http://localhost:5000
npm run dev                 # http://localhost:3000
```
The browser only talks to `/api` on the Next.js site, and Next forwards those requests to Express. That keeps the login cookie secure and avoids CORS problems.
**Note:** `API_URL` is read when the frontend is **built**, so set it before `npm run build`.

## Deploying
Step-by-step free deployment (MongoDB Atlas + Render + Vercel) is in **[DEPLOY.md](DEPLOY.md)**.
`render.yaml` sets up the API on Render automatically, and the `client` folder deploys to Vercel as-is.

## Security notes
- Passwords are hashed with bcrypt. Authenticator keys are stored encrypted (AES-256-GCM, derived from `JWT_SECRET`), each code works only once, backup codes are stored hashed, and sign-in is rate-limited with a 15-minute lock after 5 wrong codes.
- **Lost phone?** Use a backup code, then Settings → Move to a new phone. No backup codes either? Run `npm run reset-2fa` (see DEPLOY.md).
- Every data route requires a completed two-factor session (12 hours by default, `SESSION_HOURS`).
- Stock changes are atomic, so two orders placed at the same time can't push stock below zero.
- To reset a forgotten password: change `ADMIN_PASSWORD` in `.env` and run `npm run seed:admin` again.
