# MPT OmniPortal

A web-based retail analytics system built for MPT, a watch retailer operating multiple branches across Malaysia. It gives branch managers and HQ staff a single place to view sales performance, automate meeting preparation, and see demand forecasts — accessible from a web browser, Android phone, or Windows desktop.

---

## What you can do with it

- **Sales Dashboard** — view revenue, transaction counts, and brand performance for all 14 branches. Drill into any salesperson to see their monthly trend, daily heatmap, and top brands.
- **Meeting Agenda Generator** — upload the monthly POS export and the system fills the Excel meeting agenda template and generates ready-to-send WhatsApp messages for all six target branches. What used to take two hours now takes under a minute.
- **Demand Forecast** — view predicted unit demand for October, November, and December 2025, broken down by branch and brand. Helps procurement staff decide which brands to reorder before the year-end peak season.

---

## Prerequisites

You need the following installed before you start:

| Software | Version | What it is |
|---|---|---|
| Python | 3.10 or newer | Runs the backend server |
| Node.js | 18 or newer | Runs the frontend |
| pip | bundled with Python | Python package installer |

To check if these are already installed, open a terminal and run:
```
python --version
node --version
```

---

## Folder structure

```
PROJECT 2/
├── mpt-omniportal/
│   ├── backend/          ← Python FastAPI backend
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   ├── users.json
│   │   └── Sales Profit Report - By Product Group 2025.csv   ← data file
│   ├── app/              ← Next.js frontend pages
│   ├── .env.local        ← frontend environment config
│   └── package.json
└── forecasting/          ← demand forecasting pipeline (run separately)
    ├── agents/
    ├── output/           ← pre-generated forecast files (already present)
    └── requirements.txt
```

---

## Step 1 — Start the backend

Open a terminal and navigate to the backend folder:

```
cd "D:\May 2026 sem\PROJECT 2\mpt-omniportal\backend"
```

Install Python dependencies (first time only):

```
pip install -r requirements.txt
```

Start the backend server:

```
uvicorn main:app --port 8000
```

You should see: `Uvicorn running on http://0.0.0.0:8000`

Leave this terminal open. The backend must stay running while you use the app.

> **Setting a secure JWT secret (optional for local use):**
> By default the backend uses a placeholder secret key. For production, set the environment variable before starting:
> ```
> set JWT_SECRET=your-secret-here
> uvicorn main:app --port 8000
> ```
> Generate a strong secret with: `python -c "import secrets; print(secrets.token_hex(32))"`

---

## Step 2 — Start the frontend

Open a second terminal and navigate to the frontend folder:

```
cd "D:\May 2026 sem\PROJECT 2\mpt-omniportal"
```

Install Node.js dependencies (first time only):

```
npm install
```

Start the frontend:

```
npm run dev
```

You should see: `Local: http://localhost:3000`

Open your browser and go to **http://localhost:3000**

---

## Logging in

| Account | Username | Password | Access |
|---|---|---|---|
| Admin | `admin` | `admin123` | Full access to all features |
| Demo | `demo` | `demo` | Read-only, no file uploads |

---

## Data files

The dashboard reads from a CSV file that must be placed at:

```
mpt-omniportal/backend/Sales Profit Report - By Product Group 2025.csv
```

This is the trimmed POS export (the 6-column version). The full POS export (30 columns) is only needed when generating a meeting agenda — you upload it directly on the Agenda page.

---

## Meeting Agenda

1. Log in with the admin account.
2. Go to **Meeting Agenda** in the sidebar.
3. Upload the full POS export CSV for the current year (`year25` field).
4. Optionally upload the previous year's CSV for year-on-year comparison.
5. Select the meeting month and click **Generate**.
6. The Excel agenda file downloads automatically. Six WhatsApp messages appear below — click **Copy** on each to send.

---

## Demand Forecast

The forecast page (`/dashboard/forecast`) loads pre-generated predictions from `forecasting/output/forecasts.json`. This file is already included — you do not need to re-run the forecasting pipeline to use the page.

If you want to retrain the models on new data, see [Running the forecasting pipeline](#running-the-forecasting-pipeline) below.

---

## Running the forecasting pipeline

This is only needed if you have new sales data and want to regenerate the forecasts.

Install forecasting dependencies (first time only):

```
cd "D:\May 2026 sem\PROJECT 2\forecasting"
pip install -r requirements.txt
```

Place both sales CSVs in the `PROJECT 2` root folder:
- `Sales Profit Report - By Product Group 2024.csv`
- `Sales Profit Report - By Product Group 2025.csv`

Run the agents in order:

```
cd "D:\May 2026 sem\PROJECT 2\forecasting\agents"

python 01_data_explorer.py
python 02_feature_engineer.py
python 03_train_sarima.py
python 04_train_prophet.py
python 05_train_xgboost.py
python 06_train_rf.py
python 07_evaluator.py
python 08_forecaster.py
```

Agents 03–06 can be run in parallel (open separate terminals). Agents 07 and 08 must run after all four trainers finish.

After 08 completes, reload the backend cache by calling:
```
POST http://localhost:8000/api/forecast/reload
```
(requires a valid Bearer token — easiest to do via Postman or the browser dev tools)

---

## Building for production

**Web (static export + Nginx):**
```
npm run build
```
Copies the built files from `out/` to your web server. Set `NEXT_PUBLIC_BACKEND_URL` in `.env.local` to your server's public address before building.

**Windows desktop (Electron):**
```
npm run electron:build
```
Produces a Windows installer in `dist-electron/`.

**Android (Capacitor):**
```
npm run build
npx cap sync android
```
Then open the `android/` folder in Android Studio and build the APK.

---

## API endpoints (backend reference)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/login` | Returns a JWT token |
| GET | `/api/summary` | Sales data for all branches |
| POST | `/api/agenda/generate` | Generates agenda Excel + WhatsApp messages |
| GET | `/api/forecast` | Demand forecasts (filter by `branch`, `month`) |
| GET | `/api/forecast/top-brands` | Top 10 brands per branch over Oct–Dec 2025 |
| GET | `/api/forecast/comparison` | Model evaluation table |
| POST | `/api/forecast/reload` | Reloads forecast cache from disk |
| GET | `/health` | Health check |

All endpoints except `/api/login` and `/health` require a `Authorization: Bearer <token>` header.
