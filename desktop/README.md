# MPT OmniPortal Offline — Windows app for the Manager

The sales dashboard (Dashboard, Brands, Leaderboards, Explorer) and the
Meeting Agenda, offline. No login, no roles, no repairs or Daily Report, and
no internet — every http(s) request is blocked inside the app, so the sales
reports it opens cannot leave the computer.

Each screen is the website's own page (`app/dashboard/**`), so a fix made for
the website reaches this app on its next build. Nothing here touches the
website or its Vercel deploys.

Loaded reports stay on the computer between sessions (there is no sign-out to
clear them); the clock menu's "Remove all sales data" clears them. Brand logos
come from the internet on the website, so here every brand shows the generic
watch icon.

## Build the installer

From the repo root (`MPT_omniportal_V2/`):

```bash
npm install                      # root packages (once)
npm --prefix desktop install     # Electron and the packager (once)
npm run desktop:dist
```

The installer lands in `desktop/dist/MPT OmniPortal Offline Setup <version>.exe`
(about 120 MB). Raise `version` in `desktop/package.json` before building a
new release so Windows treats it as an update.

`npm run desktop:web` builds only the static app into `desktop/out/`;
`npm --prefix desktop start` then opens it in Electron without packaging.

## How it fits together

| File | Job |
|---|---|
| `app/desktop-shell.tsx` | Top bar (tabs, history, Load Data), period filter, sales data store |
| `app/page.tsx`, `app/<tab>/page.tsx` | One line each: re-export the website's page |
| `app/layout.tsx`, `app/globals.css` | Font and styles; no `AuthProvider` |
| `next.config.ts` | Static export; allows importing `../app`, `../components`, `../lib` |
| `scripts/prepare.mjs` | Copies the blank agenda template from `../public/agenda` |
| `electron/main.mjs` | Maximised window, the private `app://` scheme serving `out/`, the network block |
| `package.json` | Electron, electron-builder and the installer settings |

## Installing on the Manager's PC

The installer is not code-signed, so Windows SmartScreen shows "Windows
protected your PC" the first time. Click **More info → Run anyway**. Removing
that warning needs a paid code-signing certificate.
