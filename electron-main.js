const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron');
const path = require('path');

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 420,
    minHeight: 600,
    title: 'NeumoRemind',
    icon: path.join(__dirname, 'assets/icons/icon.ico'),
    backgroundColor: '#e8edf5',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false // Prevents throttling of timers and audio when hidden/minimized
    },
    autoHideMenuBar: true,
    show: false
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // When user clicks [X] close button: HIDE instead of quit, so background reminders stay alive!
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray && process.platform === 'win32') {
        tray.displayBalloon({
          iconType: 'info',
          title: 'NeumoRemind Running in Background',
          content: 'Your reminders will still notify and ring on time! Right-click tray icon to open or exit.'
        });
      }
    }
  });
}

function createTray() {
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets/icons/icon-192.png')).resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createFromPath(path.join(__dirname, 'assets/icons/favicon.svg'));
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('NeumoRemind — 24/7 Desktop Reminder Engine Active');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open NeumoRemind',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Run on Windows Startup',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({
          openAtLogin: item.checked,
          openAsHidden: true
        });
      }
    },
    { type: 'separator' },
    {
      label: 'Exit Completely',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Configure auto-start on Windows
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true
    });
  } catch (e) {}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// Native Notification IPC
ipcMain.on('show-native-notification', (event, data) => {
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: (data && data.title) || '⏰ Reminder Due',
      body: (data && data.body) || 'Your scheduled reminder is due now!',
      icon: path.join(__dirname, 'assets/icons/icon-192.png'),
      urgency: 'critical'
    });
    notif.on('click', () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    notif.show();
  }
});

ipcMain.on('focus-window', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
