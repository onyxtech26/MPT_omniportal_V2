const { app, BrowserWindow, shell, protocol, net, session } = require('electron');
const path = require('path');
const url = require('url');

const OUT_DIR = path.join(__dirname, '../out');

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

app.whenReady().then(() => {
  // Rewrite outgoing Origin header so backend CORS allows the request
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://103.249.84.244/*'] },
    (details, callback) => {
      details.requestHeaders['Origin'] = 'http://localhost';
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  // Rewrite incoming ACAO header so browser accepts the response
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://103.249.84.244/*'] },
    (details, callback) => {
      const headers = { ...details.responseHeaders };
      headers['access-control-allow-origin'] = ['app://mpt'];
      callback({ responseHeaders: headers });
    }
  );

  protocol.handle('app', (request) => {
    let filePath = request.url.slice('app://mpt/'.length);
    filePath = filePath.split('?')[0];
    if (!filePath || filePath === '') filePath = 'index.html';
    return net.fetch(url.pathToFileURL(path.join(OUT_DIR, filePath)).toString());
  });

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
  app.quit();
});
