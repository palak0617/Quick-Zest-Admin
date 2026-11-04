# Deploying QuickZest Admin (free)

| Part | Service | Free plan |
|---|---|---|
| Database | **MongoDB Atlas** | M0 cluster, 512 MB |
| API (`server/`) | **Render** | Web service; sleeps after 15 min idle |
| Dashboard (`client/`) | **Vercel** | Hobby plan |
| Sign-in codes | **Google / Microsoft Authenticator** app on your phone | Free, no account or SMS needed |

Allow about 30–40 minutes. Do the steps in order: each one gives you a value the next step needs.

---

## Step 1 — Put the code on GitHub (private)
1. Go to <https://github.com/new>. Name the repo `QuickZest-admin` and select **Private**. Don't add a README. Click **Create repository**.
2. Unzip `QuickZest-admin.zip` on your computer, then either:
   - **Without git:** on the new repo page click **uploading an existing file**. Open the unzipped `QuickZest-admin` folder, select **everything inside it** (`server`, `client`, `render.yaml`, `README.md`, `DEPLOY.md`), drag it in, then **Commit changes**.
   - **With git:**
     ```bash
     cd QuickZest-admin
     git init && git add . && git commit -m "QuickZest admin"
     git branch -M main
     git remote add origin https://github.com/<your-username>/QuickZest-admin.git
     git push -u origin main
     ```
3. Check that `render.yaml` sits at the **top level** of the repo, next to the `server` and `client` folders.

> Never upload a `.env` file. Secrets go into the Render and Vercel dashboards.

## Step 2 — MongoDB Atlas (database)
1. Sign up at <https://www.mongodb.com/cloud/atlas/register>, then **Create** a cluster. Choose **M0 Free**. For the region pick **AWS Mumbai (ap-south-1)** if it's offered, otherwise Singapore.
2. **Database Access → Add new database user.** Use a username such as `QuickZest` and click **Autogenerate** for the password. **Copy the password.**
3. **Network Access → Add IP address → Allow access from anywhere** (`0.0.0.0/0`). Render's free plan has no fixed IP address, so this is required; the password still protects the database.
4. **Database → Connect → Drivers.** Copy the connection string, then:
   - replace `<db_password>` with the password from step 2
   - add the database name `QuickZest` right after `.mongodb.net/`:
   ```
   mongodb+srv://QuickZest:YOURPASSWORD@cluster0.abcde.mongodb.net/QuickZest?retryWrites=true&w=majority
   ```
   This is your **MONGODB_URI**.
   If the password contains `@ : / ? # %`, regenerate it without symbols, or URL-encode it.

## Step 3 — Install an authenticator app on your phone
Install **Google Authenticator** or **Microsoft Authenticator** from the Play Store or App Store. Both are free.
You'll scan a QR code with it the first time you sign in (step 6). After that it shows a new 6-digit code every 30 seconds, and it works without internet or mobile signal.

## Step 4 — Render (API)
1. Sign up at <https://render.com> with GitHub and allow it to access the `QuickZest-admin` repo.
2. **New + → Blueprint →** select the repo. Render reads `render.yaml` and asks for these values:

   | Key | Value |
   |---|---|
   | `MONGODB_URI` | from step 2 |
   | `CLIENT_URL` | put `https://example.com` for now; you'll fix it in step 6 |
   | `ADMIN_NAME` | your name |
   | `ADMIN_EMAIL` | the email you'll log in with |
   | `ADMIN_PASSWORD` | your first password (8+ characters) |

   `JWT_SECRET` is generated for you. **Never change it**: it also unlocks the authenticator keys, and changing it means re-linking your phone.
3. Click **Apply** and wait for the deploy to show **Live** (about 3–5 minutes). Your API address looks like `https://QuickZest-api.onrender.com`. If the name is taken it gets a suffix, so copy the real one from the top of the page.
4. Check it: open `https://<your-api>.onrender.com/api/health`. You should see `{"ok":true,"db":true}`.
   The **Logs** tab should show `Admin account created for …`.

## Step 5 — Vercel (dashboard)
1. Sign up at <https://vercel.com> with GitHub → **Add New… → Project →** import `QuickZest-admin`.
2. **Root Directory → Edit → choose `client`.** This setting is important.
3. **Environment Variables:** add `API_URL` = your Render address from step 4, for example `https://QuickZest-api.onrender.com`, with no trailing slash.
4. Click **Deploy**. Your dashboard address looks like `https://QuickZest-admin.vercel.app`.

> `API_URL` is read when the dashboard is **built**. If you change it later, go to **Deployments → ⋯ → Redeploy**.

## Step 6 — Connect them and log in
1. In Render, open the service → **Environment** → set `CLIENT_URL` to your Vercel address → **Save** (it redeploys).
2. Open your Vercel address. The first load can take up to a minute while the free server wakes up; the page shows "Waking up server…".
3. Sign in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`. **Do this straight after deploying.** The first sign-in links a phone, so you want it to be yours.
4. You'll see a QR code. In your authenticator app tap **+ → Scan a QR code**, scan it, then type the 6-digit code the app shows.
5. You'll get **8 backup codes**. Click **Download** and keep the file somewhere safe (e.g. Google Drive or a printout). Each code lets you sign in once without your phone.
6. From now on, every sign-in asks for your password plus the current code from the app.
7. **Settings → change password**. Then in Render → Environment, **delete `ADMIN_PASSWORD`**. It's only used to create the account the first time.
8. **Settings → Opening balance:** enter the money you have today, so the balance is correct from the start.

That's it. Bookmark the Vercel address.

---

## After going live

**Updating the app:** commit changes to GitHub and both Render and Vercel redeploy automatically.

**The server sleeping (free plan):** after 15 idle minutes the first load takes about a minute. To avoid this, either:
- upgrade the Render service to **Starter** (about $7/month, never sleeps), or
- add a free monitor at <https://uptimerobot.com> that requests `https://<your-api>.onrender.com/api/health` every 5 minutes. One always-on service fits within Render's 750 free hours/month.

**Custom domain** (e.g. `admin.QuickZest.in`): Vercel → Project → **Settings → Domains**. Then update `CLIENT_URL` on Render.

**Chatbot free-form answers (optional):** add `ANTHROPIC_API_KEY` in Render → Environment. Without it, the chatbot still answers stock, order, money and profit questions from your data.

**Backups:** the Atlas free tier has no automatic backups. Occasionally use **Atlas → Collections → Export**, or run `mongodump "<MONGODB_URI>"` from your computer.

**Demo data:** don't load it into the live database. To try it, run `npm run seed:demo` locally against a separate test database.

**New phone:** Settings → **Move to a new phone**. Confirm with your password and a code from the old phone (or a backup code), then scan the new QR code.

**Lost your phone:** on the sign-in page tap **"Don't have your phone? Use a backup code"**. Then go to Settings → Move to a new phone.
**Lost the phone *and* the backup codes:** on your computer, in the `server` folder, run the command below. `JWT_SECRET` is in Render → Environment; click the eye icon to reveal it.
```bash
MONGODB_URI="<your atlas uri>" JWT_SECRET="<from Render>" npm run reset-2fa
```
The next sign-in shows a new QR code. Because of this, keep your Atlas password private.

**Forgot your password:** in Render → Environment set `ADMIN_PASSWORD` to a new one. Then from your computer, in the `server` folder, run:
```bash
MONGODB_URI="<your atlas uri>" ADMIN_EMAIL="<your email>" ADMIN_PASSWORD="<new password>" JWT_SECRET=x npm run seed:admin
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Vercel build fails: "Set the API_URL environment variable" | Add `API_URL` in Vercel → Settings → Environment Variables, then Redeploy. |
| Render log: "Could not connect to MongoDB" | Check the password in `MONGODB_URI` and that Atlas Network Access allows `0.0.0.0/0`. |
| `/api/health` shows `"db":false` | Same as above. |
| "Wrong code" every time | The phone's clock is off. Turn on **automatic date & time** in the phone settings. In Google Authenticator: ⋮ → Settings → Time correction → Sync now. |
| "Too many wrong codes. Locked for 15 minutes" | Wait 15 minutes. Check that you're using the **QuickZest Admin** entry in the app. |
| "Two-factor data cannot be read" | `JWT_SECRET` was changed. Put the old value back, or run `npm run reset-2fa` and link your phone again. |
| Log: "No admin account yet" | Set `ADMIN_EMAIL` and an `ADMIN_PASSWORD` of 8+ characters in Render, then **Manual Deploy → Restart**. |
| Dashboard loads but keeps going back to login | Make sure you open the **Vercel** address (not the Render one) and `API_URL` points to Render over `https://`. |
