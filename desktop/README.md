# MPT Meeting Agenda — offline Windows app

The Manager's desktop app: the Meeting Agenda on its own. No login, no roles,
no repairs, no dashboard, and no internet — every http(s) request is blocked
inside the app, so the POS reports it opens cannot leave the computer.

It shows the website's own agenda screen (`app/dashboard/agenda/page.tsx` and
`lib/agenda/`), so an agenda fix made for the website reaches this app on its
next build. Nothing here touches the website or its Vercel deploys.

## Build the installer

From the repo root (`MPT_omniportal_V2/`):

```bash
npm install                      # root packages (once)
npm --prefix desktop install     # Electron and the packager (once)
npm run desktop:dist
```

The installer lands in `desktop/dist/MPT Meeting Agenda Setup <version>.exe`
(about 120 MB). Raise `version` in `desktop/package.json` before building a
new release so Windows treats it as an update.

`npm run desktop:web` builds only the static app into `desktop/out/`;
`npm --prefix desktop start` then opens it in Electron without packaging.

## How it fits together

| File | Job |
|---|---|
| `app/page.tsx` | Header plus the shared agenda screen |
| `app/layout.tsx`, `app/globals.css` | Font and styles; no `AuthProvider` |
| `next.config.ts` | Static export; allows importing `../app` and `../lib` |
| `scripts/prepare.mjs` | Copies the blank agenda template from `../public/agenda` |
| `electron/main.mjs` | Window, the private `app://` scheme serving `out/`, the network block |
| `package.json` | Electron, electron-builder and the installer settings |

## Installing on the Manager's PC

The installer is not code-signed, so Windows SmartScreen shows "Windows
protected your PC" the first time. Click **More info → Run anyway**. Removing
that warning needs a paid code-signing certificate.
