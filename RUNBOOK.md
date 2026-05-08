# MPT OmniPortal — Operations Runbook

This document explains everything about the MPT OmniPortal system: what it is, what's running where, how to manage it, and how to fix common problems. Written so anyone can pick it up from scratch.

---

## What Is This System?

MPT OmniPortal is a retail analytics dashboard for a luxury watch retail business. It shows outlet performance, top salesmen, and top-selling products across all branches.

**Who uses it:**
- `boss` — full admin view of all outlets
- `opsmanager` — operational manager view

**How they access it:**
- Android mobile app (Capacitor APK)
- Browser: `http://103.249.84.244` (once frontend is deployed)

---

## Server Details

| Item | Value |
|---|---|
| Server IP | `103.249.84.244` |
| SSH Port | `2607` |
| SSH User | `root` |
| OS | AlmaLinux 10.1 |
| Hostname | Onyxxtech |
| RAM | 1 GB (954Mi usable) |
| Swap | 4 GB |

**How to connect from Windows:**
```powershell
ssh -p 2607 root@103.249.84.244
```

---

## System Architecture

```
Android App / Browser
        |
        | HTTP port 80
        v
     Nginx (reverse proxy)
        |
        | localhost:8000
        v
  FastAPI Backend (Gunicorn)
        |
   +----+----+
   |         |
MariaDB    CSV File
(users)  (sales data)
```

- **Nginx** receives all public traffic on port 80
- **FastAPI** runs privately on port 8000, only accessible via Nginx
- **MariaDB** stores user accounts only — NOT sales data
- **CSV file** is the actual sales data source

---

## File Locations on Server

| What | Path |
|---|---|
| Backend code | `/var/www/mpt-portal/main.py` |
| Sales CSV data | `/var/www/mpt-portal/Sales Profit Report - By Product Group 2024.csv` |
| Environment variables | `/var/www/mpt-portal/.env` |
| Python virtual env | `/var/www/mpt-portal/venv/` |
| Nginx config | `/etc/nginx/conf.d/mpt-portal.conf` |
| systemd service | `/etc/systemd/system/mpt-backend.service` |
| Backend logs (access) | `/var/log/mpt-portal/access.log` |
| Backend logs (errors) | `/var/log/mpt-portal/error.log` |

---

## Environment Variables (`.env`)

File location: `/var/www/mpt-portal/.env`

```env
JWT_SECRET=<random 32+ char string — generate with: python -c "import secrets; print(secrets.token_hex(32))">
DB_HOST=localhost
DB_USER=mptuser
DB_PASSWORD=<see server .env — never commit this>
DB_NAME=mpt_db
```

**Never commit the actual values. The real credentials live only on the server at `/var/www/mpt-portal/.env`.**

---

## Database

- **Engine:** MariaDB
- **Database name:** `mpt_db`
- **App DB user:** `mptuser` (password in server `.env`)
- **Root access:** `mysql -u root` (no password, socket auth only)

**Check users table:**
```bash
mysql -u root -e "SELECT id, username, role FROM mpt_db.users;"
```

**Add a new user (replace values):**
```bash
mysql -u root mpt_db -e "INSERT INTO users (username, password, role) VALUES ('newuser', 'plaintext-password-here', 'admin');"
```
Then immediately bcrypt the password:
```bash
source /var/www/mpt-portal/.env
DB_USER=$DB_USER DB_PASSWORD=$DB_PASSWORD DB_NAME=$DB_NAME /var/www/mpt-portal/venv/bin/python /var/www/mpt-portal/hash_passwords.py
```

---

## User Accounts

| Name | Username | Role |
|---|---|---|
| Boss | `boss` | admin |
| Operations Manager | `opsmanager` | admin |

Passwords are bcrypt-hashed in the database. Do not document plaintext passwords here.

---

## Service Management

The backend runs as a systemd service owned by the `mptadmin` system user.

**Check if backend is running:**
```bash
systemctl status mpt-backend
```

**Restart the backend:**
```bash
systemctl restart mpt-backend
```

**Stop the backend:**
```bash
systemctl stop mpt-backend
```

**View live logs:**
```bash
journalctl -u mpt-backend -f
```

**View last 50 log lines:**
```bash
journalctl -u mpt-backend -n 50 --no-pager
```

---

## Nginx Management

**Check Nginx config is valid:**
```bash
nginx -t
```

**Reload Nginx (apply config changes without downtime):**
```bash
systemctl reload nginx
```

**Restart Nginx:**
```bash
systemctl restart nginx
```

**Current Nginx config** (`/etc/nginx/conf.d/mpt-portal.conf`):
```nginx
server {
    listen 80;
    server_name 103.249.84.244;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()";

    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }
}
```

**After enabling HTTPS** (see "HTTPS Setup" section below), add to the server block:
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

## Updating Backend Code

When `main.py` changes on your Windows machine, upload it to the server:

```powershell
scp -P 2607 "D:\project 1\CODE FILES\mpt-omniportal\backend\main.py" root@103.249.84.244:/var/www/mpt-portal/
```

Then restart the backend on the server:
```bash
systemctl restart mpt-backend
```

---

## Updating the Sales CSV

When you have new sales data:

```powershell
scp -P 2607 "D:\project 1\CODE FILES\mpt-omniportal\backend\Sales Profit Report - By Product Group 2024.csv" root@103.249.84.244:/var/www/mpt-portal/
```

No restart needed — the CSV is read fresh on every API call.

---

## Quick Health Check

Run these on the server to verify everything is working:

```bash
# 1. Is the backend running?
systemctl status mpt-backend

# 2. Does the API respond?
curl http://127.0.0.1:8000/

# 3. Is Nginx proxying correctly?
curl http://127.0.0.1:80/api/

# 4. Can we log in?
curl -X POST http://127.0.0.1:8000/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"boss","password":"<boss-password>"}'
```

---

## Troubleshooting

**Backend won't start:**
```bash
journalctl -u mpt-backend -n 50 --no-pager
# Look for Python import errors or missing env vars
```

**Login returns 500:**
- Check MariaDB is running: `systemctl status mariadb`
- Check DB credentials in `/var/www/mpt-portal/.env`

**Login returns 401:**
- Password may not be hashed — run `hash_passwords.py` again
- Check username spelling

**API returns "Data file not found":**
- CSV is missing: upload it again (see "Updating the Sales CSV" above)

**Service starts then immediately stops:**
```bash
# Test the import manually
sudo -H -u mptadmin /var/www/mpt-portal/venv/bin/python -c "import main"
# Any error shown here is the root cause
```

---

## Frontend (Next.js)

**Local development files:** `D:\project 1\CODE FILES\mpt-omniportal\`

**Environment config:** `D:\project 1\CODE FILES\mpt-omniportal\.env.local`
```env
NEXT_PUBLIC_BACKEND_URL=http://103.249.84.244
```

**Build for deployment:**
```powershell
cd "D:\project 1\CODE FILES\mpt-omniportal"
npm run build
```
Output goes to `out/` folder.

**Deploy to server after build:**
```powershell
scp -P 2607 -r "D:\project 1\CODE FILES\mpt-omniportal\out\*" root@103.249.84.244:/var/www/mpt-portal/public/
```

---

## Python Dependencies

Installed in `/var/www/mpt-portal/venv/`. To add a new package:

```bash
sudo -H -u mptadmin /var/www/mpt-portal/venv/bin/pip install package-name
systemctl restart mpt-backend
```

Key packages installed: `fastapi`, `uvicorn`, `gunicorn`, `mysql-connector-python`, `python-jose`, `passlib`, `bcrypt==3.2.2`, `pandas`, `python-dotenv`

> Note: `bcrypt` must stay at version `3.2.2` — newer versions are incompatible with `passlib`.

---

## What Was Built (Session History)

| Date | What was done |
|---|---|
| 2026-05-07 | Nuclear reset of server, new deployment path `/var/www/mpt-portal/` |
| 2026-05-07 | Created `mptadmin` system user, fresh Python venv |
| 2026-05-07 | Created MariaDB `mpt_db`, users table, boss + opsmanager accounts |
| 2026-05-07 | Passwords bcrypt-hashed via `hash_passwords.py` |
| 2026-05-07 | systemd service `mpt-backend.service` created and enabled |
| 2026-05-07 | Nginx configured to proxy `/api/` to FastAPI |
| 2026-05-07 | Security hardening: CORS lockdown, rate limiting, input validation, timing attack fix |
| 2026-05-07 | Frontend build in progress |
| 2026-05-08 | Production audit: rate limiter fix, DB pool, CSV cache, /health endpoint, security headers |

---

## HTTPS Setup (Pending)

HTTPS is required before the app handles real user traffic. All credentials currently travel over plain HTTP.

**Install certbot and get a certificate:**
```bash
dnf install certbot python3-certbot-nginx -y
certbot --nginx -d 103.249.84.244
```

> Note: Let's Encrypt requires a domain name, not a bare IP. You must point a domain at the server first.
> Alternative for IP-only: use a self-signed cert or a paid cert from a CA.

**After HTTPS is active:**
1. Update Nginx to redirect HTTP → HTTPS and add HSTS header
2. Update `NEXT_PUBLIC_BACKEND_URL` in `.env.local` to `https://`
3. Rebuild and redeploy the frontend
4. Remove `cleartext: true` from `capacitor.config.ts` and set `androidScheme: 'https'`
5. Rebuild the Android APK

---

## Pending Security Improvements

| Item | Blocked by | Notes |
|---|---|---|
| httpOnly cookies for JWT | HTTPS | Replace localStorage token with `Set-Cookie: HttpOnly; SameSite=None; Secure` — requires HTTPS first or cookie won't be sent by Android WebView |
| HSTS header | HTTPS | Add `Strict-Transport-Security` to Nginx after cert is active |
| Persistent rate limiter | Redis or SQLite | Current in-memory limiter resets on every backend restart |
