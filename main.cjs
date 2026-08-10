const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;

function startBackend() {
  const serverPath = path.join(__dirname, 'server', 'index.js');
  
  // Set environment variables for the forked process
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    DB_PATH: path.join(app.getPath('userData'), 'beast_fitness.db'),
    DIST_PATH: path.join(__dirname, 'dist')
  };

  if (!app.isPackaged) {
    env.DB_PATH = path.join(__dirname, 'server', 'beast_fitness.db');
  }

  console.log('Starting backend server...');
  serverProcess = fork(serverPath, [], { env, stdio: 'pipe' });

  serverProcess.stdout.on('data', (data) => {
    console.log(`[Backend]: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`[Backend Error]: ${data}`);
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start server process:', err);
  });

  serverProcess.on('exit', (code) => {
    console.log(`Server process exited with code ${code}`);
    // Auto-restart if it crashed in production
    if (code !== 0 && app.isPackaged) {
      console.log('Restarting server in 2 seconds...');
      setTimeout(startBackend, 2000);
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'build/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false // This helps with loading local assets
    }
  });

  if (app.isPackaged) {
    // Load the file directly from the disk
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverProcess) serverProcess.kill();
});
