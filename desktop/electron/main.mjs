// Electron shell for the Manager's offline app: the sales dashboard screens
// and the Meeting Agenda.
//
// Serves the static export in ../out through a private app:// scheme (file://
// would break the pages' absolute paths, e.g. /agenda/Meeting_Agenda.xlsx),
// and blocks every http(s) request, so the sales reports the Manager opens
// cannot leave this computer even by accident.
import { app, BrowserWindow, Menu, net, protocol, session, shell } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');

// Must run before the app is ready. `secure` makes the page a secure context,
// which the "Copy message" button needs for the clipboard.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// app://agenda/<path> -> out/<path>, out/<path>/index.html for folders.
function resolveFile(requestUrl) {
  const { pathname } = new URL(requestUrl);
  const file = normalize(join(OUT_DIR, decodeURIComponent(pathname)));
  if (file !== OUT_DIR && !file.startsWith(OUT_DIR + sep)) return null; // no escaping out/
  if (existsSync(file) && statSync(file).isDirectory()) return join(file, 'index.html');
  return existsSync(file) ? file : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    // The top bar has no phone-style menu, so the window stays wide enough for it.
    minWidth: 1024,
    minHeight: 600,
    title: 'MPT OmniPortal Offline',
    backgroundColor: '#f8fafc',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // Opens maximised: the top bar shows its tab names from 1280px wide, and a
  // 1280px window leaves the page just short of that.
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  // Links (if any) open in the real browser rather than inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app://')) event.preventDefault();
  });
  win.loadURL('app://agenda/');
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    protocol.handle('app', (request) => {
      const file = resolveFile(request.url);
      if (!file) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });

    // Offline by construction: nothing over http(s), ever.
    session.defaultSession.webRequest.onBeforeRequest(
      { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
      (_details, callback) => callback({ cancel: true }),
    );

    createWindow();
  });

  app.on('window-all-closed', () => app.quit());
}
