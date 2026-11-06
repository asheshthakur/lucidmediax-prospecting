# 🌐 LucidMediax Live Hosting & Persistent Deployment Guide

This guide details how to host your **LucidMediax Client Acquisition Engine** live on the web with **Master Password protection** and **guaranteed data persistence** (zero data loss across reboots and restarts).

---

## ⚠️ Can you deploy this to Vercel? (Read Before Trying)

**Short answer:** Deploying this full application directly to Vercel is **strongly discouraged** if you want to keep your data without data loss.

Here is why:
1. **Read-Only Serverless Filesystem (`EROFS`):**
   * Vercel runs on AWS Lambda. Its filesystem is strictly read-only.
   * Because this app writes prospects, notes, audit reports, and email logs directly to SQLite (`data/lucidmediax_prospects.db`), Vercel will crash with `EROFS: read-only file system` or wipe all newly discovered leads every time the serverless container spins down (every few minutes).
2. **Native SQLite (`better-sqlite3`) Addons:**
   * `better-sqlite3` is a compiled C++ binary that expects persistent POSIX disk locks (WAL mode), which serverless lambdas do not support.
3. **Background Process & Execution Limits:**
   * Vercel terminates functions after 10–15 seconds (Hobby tier), which kills web audits and Google Maps scraper jobs before they complete.

### The Solution: Where should you deploy instead?
* **Railway (Recommended):** Uses real containers and supports attaching a **Persistent Disk** to `/app/data`. Your database, scraping engine, and master password work out of the box with zero code modifications.
* **Render:** Supports persistent disks via `render.yaml`.
* **Fly.io:** Supports persistent volumes via `fly.toml`.
* **If you MUST use Vercel:** You would need to migrate the database layer to a remote cloud database like **Turso (libSQL)** or **Supabase**, and externalize the scraper jobs.

---

## 🔒 1. Master Password & Security Architecture

The application is protected by a multi-layer security system:

- **Master Password**: Required to unlock the command center interface.
  - **Default initial password**: `lucid2026`
  - **To change via UI**: Go to **Settings & APIs** → **Master Password & Access Control** → Enter current password and new password.
  - **To configure via Environment**: Set `ADMIN_PASSWORD="YourStrongPassword"` in `.env` or in your cloud host's environment settings.
- **HMAC-SHA256 Session Tokens**: On login, the server issues an encrypted 30-day session token stored securely in your browser's `localStorage`.
- **API Guard**: Every internal API endpoint (`/api/*`) strictly rejects unauthenticated requests with `401 Unauthorized`.
- **Protected Downloads**: CSV exports and database backup downloads automatically pass the authentication token.

---

## 🛡️ 2. Zero Data-Loss Guarantee (SQLite Persistence)

All client discovery results, qualified prospects, opportunity scores, company audit histories, notes, and outreach tracking states are stored in:
```
data/lucidmediax_prospects.db
```

### Why standard cloud platforms lose SQLite data (and how we prevent it)
Platforms like Vercel or ephemeral Heroku containers have read-only or temporary file systems that reset on every restart. 

To host SQLite in the cloud without losing data, **you must attach a Persistent Volume to `/app/data`**. 

Additionally, the system features:
1. **Automated Startup Snapshots**: Every time the server starts, it automatically creates a dated backup in `data/backups/lucidmediax_prospects_daily_YYYY-MM-DD.db`.
2. **Instant 1-Click Backup Download**: In **Settings & APIs** → Click **💾 Download Complete SQLite Database (.db Snapshot)** to download a complete copy directly to your laptop at any time.

---

## 🚀 3. Recommended Deployment Options

### Option A: Railway (Fastest, Easiest Cloud Deployment with Persistent Disk)

Railway provides persistent disks, zero-config Docker builds, and free automatic SSL (`https://...up.railway.app`).

1. **Push your project to GitHub** (if not already):
   ```bash
   cd "/Users/asheshthakur/Documents/Google Scrapper/lucidmediax-prospecting"
   git init
   git add .
   git commit -m "feat: LucidMediax Client Acquisition Engine with Master Auth & Persistence"
   gh repo create lucidmediax-prospecting --private --source=. --push
   ```

2. **Deploy on Railway**:
   - Go to [railway.app](https://railway.app) and sign in with GitHub.
   - Click **+ New Project** → **Deploy from GitHub repo** → Select `lucidmediax-prospecting`.
   
3. **Attach Persistent Volume (Crucial for Data Retention)**:
   - In your Railway project canvas, click on your service.
   - Go to the **Volumes** tab → Click **+ Add Volume**.
   - Set **Mount Path** to:
     ```
     /app/data
     ```
   - Click **Add**.

4. **Set Environment Variables**:
   - In the **Variables** tab, add:
     - `ADMIN_PASSWORD`: Your secret master password (e.g. `Lucid@Dubai2026!`)
     - `AUTH_SECRET`: Any random 32-character string.
     - `PORT`: `3500`

5. **Generate Public Domain**:
   - Go to **Settings** → **Networking** → Click **Generate Domain**.
   - You will receive a live URL like `https://lucidmediax-prospecting-production.up.railway.app`.
   - Open that URL in any browser or on your phone, enter your master password, and your command center is live!

---

### Option B: Render (Web Service with Persistent Disk)

Render supports persistent disks using the included `render.yaml` file:

1. Push your repository to GitHub.
2. Sign in to [render.com](https://render.com).
3. Click **New +** → **Blueprint** → Select your GitHub repository.
4. Render will read `render.yaml` and automatically configure:
   - Web Service running Node.js.
   - 1 GB Persistent Disk mounted at `/app/data`.
5. Enter your preferred `ADMIN_PASSWORD` in the environment configuration and deploy.

---

### Option C: Dedicated VPS (DigitalOcean / Hetzner / AWS EC2 with Docker)

If you have a Linux VPS (\$4–\$6/month):

1. Clone repository onto your server.
2. Build and launch with Docker using a volume mount:
   ```bash
   docker build -t lucidmediax-prospecting .
   docker run -d \
     --name lucidmediax \
     --restart unless-stopped \
     -p 3500:3500 \
     -v $(pwd)/data:/app/data \
     -e ADMIN_PASSWORD="your-strong-password" \
     lucidmediax-prospecting
   ```
3. Your data in `./data` on the host machine will survive server reboots, container updates, and restarts.

---

### Option D: 24/7 Background Daemon on Mac + Free Cloudflare Tunnel (Zero Cost)

If you prefer to keep everything running directly on your Mac without any monthly cloud fees:

1. **Install the macOS 24/7 background service**:
   ```bash
   cd "/Users/asheshthakur/Documents/Google Scrapper/lucidmediax-prospecting"
   ./scripts/setup-macos-daemon.sh
   ```
   *The server will now run silently in the background 24/7 and automatically start whenever your Mac boots.*

2. **Access Remotely via Cloudflare Tunnel (Free HTTPS)**:
   - Install `cloudflared`:
     ```bash
     brew install cloudflared
     ```
   - Run a quick tunnel:
     ```bash
     cloudflared tunnel --url http://localhost:3500
     ```
   - Cloudflare will print a secure URL like `https://random-words.trycloudflare.com`.
   - You can access this URL from your iPhone, iPad, or any computer in the world with your master password!

3. **To stop the background daemon at any time**:
   ```bash
   ./scripts/stop-macos-daemon.sh
   ```

---

## 📊 Summary of Persistence Safeguards

| Component | Location | Protection Mechanism |
|---|---|---|
| Active Prospect DB | `data/lucidmediax_prospects.db` | Persistent Volume (`/app/data`) |
| Daily Snapshot Backups | `data/backups/lucidmediax_prospects_daily_*.db` | Auto-generated on each server boot |
| Manual Snapshot | Browser Download | 1-click in Settings UI (`/api/backup/database`) |
| Master Authentication | `system_settings` table / `.env` | SHA-256 HMAC 30-day cryptographic tokens |
