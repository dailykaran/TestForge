// @ts-nocheck
import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { setupIpcHandlers } from './ipcHandlers';
import { getAppIcon } from './iconHelper';

// Use process.cwd() for development, app.getAppPath() for production
const APP_ROOT = process.cwd();
process.env.APP_ROOT = APP_ROOT;
const __dirname = path.join(APP_ROOT, 'dist-electron');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Creating window with preload:', preloadPath);
  console.log('Preload exists:', fs.existsSync(preloadPath));
  
  // Get the app icon
  const appIcon = getAppIcon();
  
  win = new BrowserWindow({
    icon: appIcon,
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setTitle('TestForge');

  if (VITE_DEV_SERVER_URL) {
    console.log('Loading dev server:', VITE_DEV_SERVER_URL);
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    console.log('Loading from file:', path.join(RENDERER_DIST, 'index.html'));
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  win.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('Preload error:', preloadPath, error);
  });
}

// Cleanup temporary files on app close
function cleanupTempFiles() {
  try {
    const tempDir = app.getPath('temp');
    const screenshotsDir = path.join(tempDir, 'screenshots');
    
    // Clean up screenshots directory
    if (fs.existsSync(screenshotsDir)) {
      const files = fs.readdirSync(screenshotsDir);
      files.forEach(file => {
        try {
          fs.unlinkSync(path.join(screenshotsDir, file));
        } catch (e) {
          console.warn('Failed to delete screenshot:', file);
        }
      });
      try {
        fs.rmdirSync(screenshotsDir);
      } catch (e) {
        console.warn('Failed to remove screenshots directory');
      }
    }
    
    // Clean up video files (look for files matching recording_*.webm pattern)
    const tempFiles = fs.readdirSync(tempDir);
    tempFiles.forEach(file => {
      if (file.startsWith('recording_') && file.endsWith('.webm')) {
        try {
          fs.unlinkSync(path.join(tempDir, file));
        } catch (e) {
          console.warn('Failed to delete video file:', file);
        }
      }
    });
    
    console.log('Temporary files cleaned up successfully');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

/**
 * Handles app closure and cleanup
 * 
 * Cleanup sequence:
 * 1. Renderer process clears sessionStorage via sessionMemoryUtils
 * 2. Main process receives 'session-memory-clear' IPC event
 * 3. Temp files are deleted (videos, screenshots)
 * 4. Session memory (Zustand store) automatically clears as it's in-memory only
 * 5. App quits
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    cleanupTempFiles();
    app.quit();
    win = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  createWindow();
  if (win) {
    setupIpcHandlers(win);
  }
});
