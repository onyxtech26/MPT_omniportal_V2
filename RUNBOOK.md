# MPT OmniPortal — Complete Operations Guide

This document tells you everything you need to run, maintain, and fix the MPT OmniPortal system. It assumes you know nothing. Every term is explained. Every command is shown in full — copy-paste exactly.

---

## Table of Contents

1. [What Is This System?](#1-what-is-this-system)
2. [How to Connect to the Server](#2-how-to-connect-to-the-server)
3. [Daily Health Check](#3-daily-health-check)
4. [Reading Logs](#4-reading-logs)
5. [Updating the Sales Data](#5-updating-the-sales-data)
6. [Deploying Backend Code Changes](#6-deploying-backend-code-changes)
7. [Deploying Frontend Changes](#7-deploying-frontend-changes)
8. [Building and Deploying the Android APK](#8-building-and-deploying-the-android-apk)
9. [User Management](#9-user-management)
10. [Restarting and Stopping Services](#10-restarting-and-stopping-services)
11. [Troubleshooting](#11-troubleshooting)
12. [Architecture Reference](#12-architecture-reference)
13. [Pending Work (Not Done Yet)](#13-pending-work-not-done-yet)

---

## 1. What Is This System?

MPT OmniPortal is a private analytics dashboard for a luxury watch retail business. It shows:
- Revenue by outlet (branch)
- Top salesmen per outlet
- Top-selling product brands
- Monthly and daily breakdowns per salesman

**Who uses it:**

| Person | Username | What they see |
|---|---|---|
| Boss | `boss` | All outlets, full data |
| Operations Manager | `opsmanager` | All outlets, full data |

**How they access it:**
- **Android phone:** via the MPT OmniPortal app (APK)
- **Web browser:** `http://103.249.84.244` (once the frontend is deployed)

**How the system works (plain English):**

The app on the phone talks to a program running on a rented server in the internet. That program reads a spreadsheet (CSV file) you upload and returns the data as charts and tables. Login is protected by a username and password stored in a database on the same server.

---

## 2. How to Connect to the Server

> **What is SSH?** SSH (Secure Shell) is a program that lets you type commands on a remote computer as if you were sitting in front of it. Think of it as a remote control for the server.

**Server details:**

| Item | Value |
|---|---|
| IP address | `103.249.84.244` |
| SSH port | `2607` |
| Login username | `root` |
| Operating system | AlmaLinux 10.1 |
| RAM | 1 GB |
| Swap (extra memory) | 4 GB |

**To connect (run this in PowerShell on your Windows PC):**

```powershell
ssh -p 2607 root@103.249.84.244
```

You will be asked for the root password. Type it and press Enter. You won't see the password as you type — that's normal.

**Once connected, your prompt will look like:**
```
[root@Onyxxtech ~]#
```

That means you're now typing commands on the server, not on your own PC. When you want to disconnect, type `exit` and press Enter.

---

## 3. Daily Health Check

Run these commands on the server to confirm everything is working. Connect via SSH first (see Section 2).

### Step 1 — Is the backend running?

```bash
systemctl status mpt-backend
```

**Good output** — look for the word `active (running)` in green:
```
● mpt-backend.service - MPT OmniPortal Backend
     Active: active (running) since ...
```

**Bad output** — if you see `failed` or `inactive`, go to [Troubleshooting](#11-troubleshooting).

### Step 2 — Does the API respond?

```bash
curl http://127.0.0.1:8000/health
```

**Good output:**
```json
{"status":"ok"}
```

**Bad output:** Any error message. Go to [Troubleshooting](#11-troubleshooting).

### Step 3 — Is Nginx working?

> **What is Nginx?** Nginx (pronounced "engine-x") is a program that sits in front of the backend and handles incoming connections from the internet. It's the gatekeeper.

```bash
systemctl status nginx
```

Look for `active (running)`.

### Step 4 — Is the database running?

> **What is the database?** MariaDB is a program that stores usernames and passwords for login. Sales data is NOT in the database — it comes from the CSV file.

```bash
systemctl status mariadb
```

Look for `active (running)`.

### Full one-liner check (all four at once):

```bash
systemctl status mpt-backend nginx mariadb --no-pager | grep -E "●|Active:"
```

---

## 4. Reading Logs

Logs are records of what the backend has been doing — useful when something goes wrong.

### View live logs (streaming, press Ctrl+C to stop):

```bash
journalctl -u mpt-backend -f
```

### View the last 50 lines:

```bash
journalctl -u mpt-backend -n 50 --no-pager
```

### View logs from today only:

```bash
journalctl -u mpt-backend --since today --no-pager
```

### What to look for in logs:

- `INFO` lines — normal operation
- `WARNING` lines — something is slow or unexpected but not broken
- `ERROR` lines — something broke, this is what you need to read
- Lines with `500` or `503` — server errors
- Lines with `401` — login failures (could be a user mistyping their password)
- Lines with `429` — too many login attempts from one person (rate limit hit)

---

## 5. Updating the Sales Data

The dashboard reads sales data from a CSV (spreadsheet) file. When you have new data, you upload the new file to the server. No restart is needed — the backend automatically picks up the new file on the next request.

**The file is:** `Sales Profit Report - By Product Group 2024.csv`

**Local path on your Windows PC:**
```
D:\project 1\CODE FILES\mpt-omniportal\backend\Sales Profit Report - By Product Group 2024.csv
```

**On the server, the file lives at:**
```
/var/www/mpt-portal/Sales Profit Report - By Product Group 2024.csv
```

### To upload the new CSV file:

Open PowerShell on your Windows PC (do NOT SSH in first — run this locally):

```powershell
scp -P 2607 "D:\project 1\CODE FILES\mpt-omniportal\backend\Sales Profit Report - By Product Group 2024.csv" root@103.249.84.244:/var/www/mpt-portal/
```

You will be asked for the root password. That's it — the dashboard will use the new data immediately.

### To verify the upload worked:

SSH into the server, then run:

```bash
ls -lh "/var/www/mpt-portal/Sales Profit Report - By Product Group 2024.csv"
```

You should see the file size and a recent modification time.

---

## 6. Deploying Backend Code Changes

If you change `backend/main.py` on your Windows PC, you need to upload it to the server and restart the backend.

**Step 1 — Upload the file** (run on your Windows PC in PowerShell, NOT on the server):

```powershell
scp -P 2607 "D:\project 1\CODE FILES\mpt-omniportal\backend\main.py" root@103.249.84.244:/var/www/mpt-portal/
```

**Step 2 — Restart the backend** (run on the server after SSH-ing in):

```bash
systemctl restart mpt-backend
```

**Step 3 — Confirm it started correctly:**

```bash
systemctl status mpt-backend
```

Look for `active (running)`. If it says `failed`, check the logs:

```bash
journalctl -u mpt-backend -n 30 --no-pager
```

### If you added new Python packages:

If your code change uses a new Python library (a package that wasn't there before), you need to install it first:

```bash
sudo -H -u mptadmin /var/www/mpt-portal/venv/bin/pip install package-name
systemctl restart mpt-backend
```

> **Important:** `bcrypt` must stay at version `3.2.2` exactly. Never upgrade it. The password hashing library (`passlib`) breaks with newer versions.

---

## 7. Deploying Frontend Changes

The frontend is the website/app interface — the screens users actually see. It's built with Next.js (a JavaScript framework) and then compiled into static HTML files that are uploaded to the server.

### Step 1 — Make your code changes

Edit files in `D:\project 1\CODE FILES\mpt-omniportal\` on your Windows PC.

### Step 2 — Build the frontend

Open PowerShell on your Windows PC and run:

```powershell
cd "D:\project 1\CODE FILES\mpt-omniportal"
npm run build
```

This creates a folder called `out/` with all the compiled HTML/CSS/JS files. It takes about 30–60 seconds.

If the build fails, read the error message. Common causes:
- TypeScript type errors (red text with file names and line numbers)
- A missing import or typo in the code

### Step 3 — Upload the built files to the server

```powershell
scp -P 2607 -r "D:\project 1\CODE FILES\mpt-omniportal\out\*" root@103.249.84.244:/var/www/mpt-portal/public/
```

### Step 4 — Verify

Open `http://103.249.84.244` in a browser. You should see the login screen.

---

## 8. Building and Deploying the Android APK

The Android app is a wrapper (called Capacitor) around the same frontend website. When the frontend changes, you need to rebuild the APK too.

> **What is an APK?** An APK is the Android app installer file — like a `.exe` on Windows. Users install it on their phone.

### Prerequisites

You need Android Studio installed on your Windows PC. If it's not installed, download it from the official Android developer site.

### Step 1 — Build the frontend first

```powershell
cd "D:\project 1\CODE FILES\mpt-omniportal"
npm run build
```

### Step 2 — Sync the built files into the Android project

```powershell
npx cap sync android
```

### Step 3 — Build the APK

```powershell
npx cap open android
```

This opens Android Studio. In Android Studio:
1. Wait for it to finish loading (progress bar at the bottom)
2. Click **Build** in the top menu
3. Click **Build Bundle(s) / APK(s)**
4. Click **Build APK(s)**
5. Wait for it to finish — click the notification that says "APK(s) generated" to find the file

The APK file will be at:
```
D:\project 1\CODE FILES\mpt-omniportal\android\app\build\outputs\apk\debug\app-debug.apk
```

### Step 4 — Install on the phone

Send the APK file to the phone (via WhatsApp, email, USB, etc.). On the phone:
1. Open the file
2. If it says "Install blocked", go to Settings → Security → Allow from this source
3. Tap Install

---

## 9. User Management

User accounts (usernames and passwords) are stored in the MariaDB database on the server. All commands below are run on the server after SSH-ing in.

### View existing users

```bash
mysql -u root -e "SELECT id, username, role FROM mpt_db.users;"
```

### Add a new user

**Step 1 — Insert the user with a temporary plain-text password:**

```bash
mysql -u root mpt_db -e "INSERT INTO users (username, password, role) VALUES ('newusername', 'temporary-password', 'admin');"
```

Replace `newusername` and `temporary-password` with the real values.

**Step 2 — Hash all passwords** (this converts the plain-text password into a secure encrypted form):

```bash
source /var/www/mpt-portal/.env
DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD DB_NAME=$DB_NAME /var/www/mpt-portal/venv/bin/python /var/www/mpt-portal/hash_passwords.py
```

> **Why hash?** Storing plain-text passwords is dangerous. If the database is ever leaked, anyone could read them. Hashing scrambles the password into an unreadable string — the login system can verify it's correct without ever storing the original.

### Change a user's password

**Step 1 — Set a new plain-text password temporarily:**

```bash
mysql -u root mpt_db -e "UPDATE users SET password = 'new-plain-text-password' WHERE username = 'boss';"
```

**Step 2 — Hash it immediately:**

```bash
source /var/www/mpt-portal/.env
DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD DB_NAME=$DB_NAME /var/www/mpt-portal/venv/bin/python /var/www/mpt-portal/hash_passwords.py
```

### Delete a user

```bash
mysql -u root mpt_db -e "DELETE FROM users WHERE username = 'username-to-delete';"
```

---

## 10. Restarting and Stopping Services

> **What is a service?** A service (also called a daemon) is a program that runs continuously in the background. The backend, Nginx, and MariaDB all run as services.

### Backend (FastAPI)

```bash
# Check status
systemctl status mpt-backend

# Restart (use this after uploading new code)
systemctl restart mpt-backend

# Stop
systemctl stop mpt-backend

# Start (if stopped)
systemctl start mpt-backend
```

### Nginx (web proxy)

```bash
# Check status
systemctl status nginx

# Reload config without downtime (use this after changing nginx config)
systemctl reload nginx

# Restart (causes a brief interruption)
systemctl restart nginx

# Test if config file is valid before reloading
nginx -t
```

### MariaDB (database)

```bash
# Check status
systemctl status mariadb

# Restart
systemctl restart mariadb
```

### Restart everything at once

```bash
systemctl restart mpt-backend nginx mariadb
```

---

## 11. Troubleshooting

### The app shows a blank screen or "Cannot connect"

1. Check if the backend is running: `systemctl status mpt-backend`
2. Check if Nginx is running: `systemctl status nginx`
3. Test the API directly: `curl http://127.0.0.1:8000/health`
4. If the API responds but Nginx doesn't proxy correctly: `nginx -t && systemctl reload nginx`

---

### Login returns "Invalid username or password" (401)

**Cause A — Wrong password.**
The user is typing the wrong password. Have them try again carefully.

**Cause B — Password was entered plain-text and never hashed.**
Run the hash script:
```bash
source /var/www/mpt-portal/.env
DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD DB_NAME=$DB_NAME /var/www/mpt-portal/venv/bin/python /var/www/mpt-portal/hash_passwords.py
```

**Cause C — Wrong username spelling.**
Check the username in the database:
```bash
mysql -u root -e "SELECT username FROM mpt_db.users;"
```

---

### Login returns "Too many login attempts" (429)

Someone tried the wrong password 5 times in 60 seconds and got locked out.

**Fix — Restart the backend to clear the lock:**
```bash
systemctl restart mpt-backend
```

> Note: this resets all rate limits for all users. The lock is in-memory only — it doesn't persist to disk.

---

### Login returns "Service unavailable" (500)

The backend cannot connect to the database.

**Check if MariaDB is running:**
```bash
systemctl status mariadb
```

If it's down, start it:
```bash
systemctl start mariadb
```

If it's running but login still fails, check the credentials in the environment file:
```bash
cat /var/www/mpt-portal/.env
```

Make sure `DB_USER`, `DB_PASSWORD`, and `DB_NAME` are correct.

---

### Dashboard shows "Error: Could not reach server"

The frontend loaded but cannot get data from the backend.

1. Test the summary endpoint with a valid token:
   ```bash
   TOKEN=$(curl -s -X POST http://127.0.0.1:8000/api/login \
     -H "Content-Type: application/json" \
     -d '{"username":"boss","password":"THE-REAL-PASSWORD"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
   curl http://127.0.0.1:8000/api/summary -H "Authorization: Bearer $TOKEN"
   ```
2. If this returns data, the problem is in the frontend's `NEXT_PUBLIC_BACKEND_URL` — check `.env.local`
3. If this returns an error, check backend logs: `journalctl -u mpt-backend -n 50 --no-pager`

---

### Dashboard shows "Data file not found"

The CSV sales data file is missing from the server.

**Upload it again:**
```powershell
scp -P 2607 "D:\project 1\CODE FILES\mpt-omniportal\backend\Sales Profit Report - By Product Group 2024.csv" root@103.249.84.244:/var/www/mpt-portal/
```

---

### Backend won't start after uploading new code

Check what the error is:
```bash
journalctl -u mpt-backend -n 50 --no-pager
```

Common causes:
- **Python syntax error** — you made a typo in `main.py`. The log will show the file name and line number.
- **Missing package** — you used a library that isn't installed. Install it:
  ```bash
  sudo -H -u mptadmin /var/www/mpt-portal/venv/bin/pip install the-package-name
  ```
- **Missing environment variable** — the `.env` file is missing or incomplete. Check:
  ```bash
  cat /var/www/mpt-portal/.env
  ```

Test the import manually to see the exact error:
```bash
sudo -H -u mptadmin /var/www/mpt-portal/venv/bin/python -c "import sys; sys.path.insert(0, '/var/www/mpt-portal'); import main"
```

---

### Nginx warning: "conflicting server name"

If you see `nginx: [warn] conflicting server name "103.249.84.244"` when running `nginx -t`, there are two config files both claiming to handle that IP.

Check what config files exist:
```bash
ls /etc/nginx/conf.d/
```

There should only be one file for this app: `mpt-portal.conf`. If you see others (`mpt_portal.conf`, `mpt_proxy.conf`), delete the duplicates:
```bash
rm /etc/nginx/conf.d/mpt_portal.conf
rm /etc/nginx/conf.d/mpt_proxy.conf
nginx -t && systemctl reload nginx
```

---

### Server is slow or unresponsive

The server only has 1 GB RAM. If it's running out:

```bash
free -h
```

Example output:
```
               total   used   free
Mem:           954Mi   890Mi   64Mi
Swap:          4.0Gi   1.2Gi  2.8Gi
```

If "free" under Mem is near 0 and Swap "used" is high, the server is swapping heavily (using the slower swap memory). This makes everything slow.

**Find what's using memory:**
```bash
ps aux --sort=-%mem | head -15
```

**Quick fix — restart the backend to free up memory:**
```bash
systemctl restart mpt-backend
```

---

## 12. Architecture Reference

### How the pieces fit together

```
User's Phone / Browser
        |
        | HTTP port 80 (public internet)
        v
     Nginx
     (the gatekeeper — receives all outside traffic, forwards it to the backend)
        |
        | localhost:8000 (internal only, not reachable from outside)
        v
  FastAPI backend (Python)
  (handles login, reads the CSV, returns data)
        |
   +----+----+
   |         |
MariaDB    CSV File
(stores    (stores all
usernames   sales data)
& passwords)
```

- Nothing in the system is accessible from the internet except through Nginx on port 80
- The backend, database, and CSV file are all on the same server, talking to each other locally

---

### File locations on the server

| What | Path on server |
|---|---|
| Backend code | `/var/www/mpt-portal/main.py` |
| Sales CSV data | `/var/www/mpt-portal/Sales Profit Report - By Product Group 2024.csv` |
| Environment variables | `/var/www/mpt-portal/.env` |
| Python virtual env | `/var/www/mpt-portal/venv/` |
| Password hash script | `/var/www/mpt-portal/hash_passwords.py` |
| Frontend static files | `/var/www/mpt-portal/public/` |
| Nginx config | `/etc/nginx/conf.d/mpt-portal.conf` |
| systemd service definition | `/etc/systemd/system/mpt-backend.service` |

---

### Environment variables

These are stored in `/var/www/mpt-portal/.env` on the server. Never commit real values to git.

```env
JWT_SECRET=<random 32+ char string — generate with: python -c "import secrets; print(secrets.token_hex(32))">
DB_HOST=localhost
DB_USER=mptuser
DB_PASSWORD=<see server .env — never commit this>
DB_NAME=mpt_db
```

**To generate a new JWT secret:**
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

---

### Nginx config (`/etc/nginx/conf.d/mpt-portal.conf`)

```nginx
server {
    listen 80;
    server_name 103.249.84.244;

    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()";

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

### Python packages installed

Located in `/var/www/mpt-portal/venv/`. Key packages:

| Package | Purpose |
|---|---|
| `fastapi` | The web framework the backend is built on |
| `gunicorn` | Runs multiple backend workers for better performance |
| `uvicorn` | The server that runs FastAPI |
| `pandas` | Reads and processes the CSV sales data |
| `mysql-connector-python` | Connects to the MariaDB database |
| `passlib` + `bcrypt==3.2.2` | Password hashing (bcrypt MUST stay at 3.2.2) |
| `python-jose` | Creates and verifies JWT login tokens |
| `python-dotenv` | Reads the `.env` file |

---

### User accounts

| Name | Username | Role |
|---|---|---|
| Boss | `boss` | admin |
| Operations Manager | `opsmanager` | admin |

Passwords are bcrypt-hashed in the database. Never document plaintext passwords here — get them from whoever set them up.

---

### Frontend local files (your Windows PC)

| What | Path |
|---|---|
| All frontend code | `D:\project 1\CODE FILES\mpt-omniportal\` |
| Backend code | `D:\project 1\CODE FILES\mpt-omniportal\backend\` |
| Frontend env config | `D:\project 1\CODE FILES\mpt-omniportal\.env.local` |
| Android project | `D:\project 1\CODE FILES\mpt-omniportal\android\` |
| Built frontend files | `D:\project 1\CODE FILES\mpt-omniportal\out\` |

**`.env.local` content:**
```env
NEXT_PUBLIC_BACKEND_URL=http://103.249.84.244
```

---

## 13. Pending Work (Not Done Yet)

These improvements are planned but blocked. Do not skip the prerequisites.

### HTTPS (SSL/TLS encryption)

**What it does:** Encrypts traffic between the phone/browser and the server. Right now everything travels in plain text — someone on the same network could read login credentials.

**Why it's not done:** Let's Encrypt (the free certificate service) requires a domain name (like `portal.yourcompany.com`), not a bare IP address (`103.249.84.244`). You need to buy a domain and point it at the server first.

**Steps once you have a domain:**

1. Point the domain's DNS A record to `103.249.84.244`

2. SSH into the server and install certbot:
   ```bash
   dnf install certbot python3-certbot-nginx -y
   certbot --nginx -d yourdomain.com
   ```

3. After the certificate is active, add this to the Nginx `server` block:
   ```nginx
   add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
   ```

4. Update `.env.local` on your Windows PC:
   ```env
   NEXT_PUBLIC_BACKEND_URL=https://yourdomain.com
   ```

5. Rebuild and redeploy the frontend (see Section 7)

6. Update `capacitor.config.ts` for the Android app:
   ```typescript
   server: {
     androidScheme: 'https',
     allowNavigation: ['yourdomain.com'],
     // remove the cleartext: true line
   }
   ```

7. Rebuild the Android APK (see Section 8)

---

### httpOnly Cookies for JWT

**What it does:** Stores the login token in a secure, hidden cookie instead of localStorage. This prevents JavaScript on the page from reading the token (protects against a class of attack called XSS).

**Why it's not done:** Requires HTTPS first. The Android WebView needs `SameSite=None; Secure` cookies, which only work over HTTPS.

**Do this after HTTPS is set up.**

---

### Persistent Rate Limiter

**What it does:** The current login rate limiter (5 attempts per minute per IP) resets every time the backend restarts. A persistent limiter would survive restarts.

**Why it's not done:** Requires adding Redis or a SQLite database to store the attempt counts across restarts.

**How much it matters:** Low priority for internal use. The current limiter still works — it just resets on restart.

---

## Session History

| Date | What was done |
|---|---|
| 2026-05-07 | Server reset, new deployment at `/var/www/mpt-portal/` |
| 2026-05-07 | Created `mptadmin` system user, Python venv, MariaDB database |
| 2026-05-07 | Created user accounts: `boss`, `opsmanager` with bcrypt-hashed passwords |
| 2026-05-07 | systemd service `mpt-backend` created and enabled |
| 2026-05-07 | Nginx configured to proxy `/api/` to FastAPI |
| 2026-05-07 | Security hardening: CORS lockdown, rate limiting, input validation, timing attack fix |
| 2026-05-08 | Production audit: rate limiter fix (X-Real-IP), DB pool, CSV cache, /health endpoint, security headers |
| 2026-05-10 | Full production audit + fix cycle: fixed rate limiter IP bug, added 401 redirect, pinned requirements, removed unused npm packages, cleaned Nginx config conflicts, verified all security headers live |
