const { app, BrowserWindow, shell, protocol, net } = require('electron');
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const http = require('http');

const OUT_DIR = path.join(__dirname, '../out');
const BACKEND_PORT = 8000;
const HEALTH_URL = `http://localhost:${BACKEND_PORT}/health`;

let backendProcess = null;

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function backendExePath() {
  // Packaged: resources/backend/backend.exe  |  Dev: backend/dist/backend/backend.exe
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'backend', 'backend.exe');
  }
  return path.join(__dirname, '../backend/dist/backend/backend.exe');
}

function startBackend() {
  const exe = backendExePath();
  backendProcess = spawn(exe, [], {
    cwd: path.dirname(exe),
    windowsHide: true,
  });
  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });
}

function stopBackend() {
  if (backendProcess && !backendProcess.killed) {
    // On Windows, kill the whole process tree
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
    } else {
      backendProcess.kill();
    }
    backendProcess = null;
  }
}

function waitForBackend(timeoutMs = 30000, intervalMs = 400) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const probe = () => {
      const req = http.get(HEALTH_URL, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve(true);
        retry();
      });
      req.on('error', retry);
      req.setTimeout(2000, () => req.destroy());
    };
    const retry = () => {
      if (Date.now() > deadline) return resolve(false);
      setTimeout(probe, intervalMs);
    };
    probe();
  });
}

app.whenReady().then(async () => {
  protocol.handle('app', (request) => {
    let filePath = request.url.slice('app://mpt/'.length);
    filePath = filePath.split('?')[0];
    if (!filePath || filePath === '') filePath = 'index.html';
    return net.fetch(url.pathToFileURL(path.join(OUT_DIR, filePath)).toString());
  });

  startBackend();
  await waitForBackend();
  createWindow();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'MPT OmniPortal',
    icon: path.join(__dirname, '../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    backgroundColor: '#f8fafc',
  });

  win.loadURL('app://mpt/index.html');
  win.setMenuBarVisibility(false);

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    shell.openExternal(openUrl);
    return { action: 'deny' };
  });
}

app.on('window-all-closed', () => {
  stopBackend();
  app.quit();
});

app.on('before-quit', stopBackend);
