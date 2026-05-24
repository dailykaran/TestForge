import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { setupIpcHandlers } from './ipcHandlers';
import { getSafeTempDir, getScreenshotsDir } from './pathValidator';
import { getAppIcon } from './iconHelper';

// Use process.cwd() for development, app.getAppPath() for production
const APP_ROOT = process.cwd();
process.env.APP_ROOT = APP_ROOT;
const __dirname = path.join(APP_ROOT, 'dist-electron');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

// Configure cache and user data paths BEFORE Electron initializes
// Use a temp directory in development to avoid Windows permission issues
const userDataPath = process.env.NODE_ENV === 'production'
  ? path.resolve(process.env.APP_ROOT, '.app-data')
  : path.join(os.tmpdir(), 'TestForge-electron');
app.setPath('userData', userDataPath);

// Ensure the directories exist before Chromium initializes
const cachePath = path.join(userDataPath, 'cache');
const logsPath = path.join(userDataPath, 'logs');
const gpuCachePath = path.join(userDataPath, 'GPUCache');

fs.mkdirSync(cachePath, { recursive: true });
fs.mkdirSync(logsPath, { recursive: true });
fs.mkdirSync(gpuCachePath, { recursive: true });

// Force Chromium to use the local cache directories
app.commandLine.appendSwitch('disk-cache-dir', cachePath);
app.commandLine.appendSwitch('gpu-cache-dir', gpuCachePath);

// Disable disk caching in development to avoid persistent Windows permission issues
app.commandLine.appendSwitch('disable-application-cache');
app.commandLine.appendSwitch('disable-cache');
app.commandLine.appendSwitch('disk-cache-size', '0');
app.commandLine.appendSwitch('media-cache-size', '0');
app.commandLine.appendSwitch('disable-gpu-cache');

app.setPath('cache', cachePath);
app.setPath('logs', logsPath);

console.log('Electron data paths:', {
  userData: userDataPath,
  cache: cachePath,
  logs: logsPath,
  gpuCache: gpuCachePath,
});

let win: BrowserWindow | null;

function onWebContentsCrashed(webContents: Electron.WebContents, listener: () => void): void {
  (webContents as unknown as { on(event: 'crashed', listener: () => void): void }).on('crashed', listener);
}

function onAppWindowAllClosedBeforeQuit(appInstance: Electron.App, listener: () => void): void {
  (appInstance as unknown as { on(event: 'window-all-closed-before-quit', listener: () => void): void }).on('window-all-closed-before-quit', listener);
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Creating window with preload:', preloadPath);
  console.log('Preload exists:', fs.existsSync(preloadPath));
  
  // Get the app icon
  const appIcon = getAppIcon();
  
  try {
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
  } catch (error: unknown) {
    console.error('Error creating BrowserWindow:', error);
    throw error;
  }

  if (!win) {
    console.error('Failed to create window - win is null');
    return;
  }

  win.setTitle('TF');

  // SECURITY: Set Content Security Policy headers
  try {
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Required for React and Vite
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob:",
            "media-src 'self' blob:",
            "font-src 'self' data:",
            "connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com", // Allow API calls
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
          ].join('; ')
        }
      });
    });
  } catch (error: unknown) {
    console.error('Error setting CSP headers:', error);
  }

  if (VITE_DEV_SERVER_URL) {
    console.log('Loading dev server:', VITE_DEV_SERVER_URL);
    win.loadURL(VITE_DEV_SERVER_URL).catch(error => {
      console.error('Error loading URL:', error);
    });
  } else {
    console.log('Loading from file:', path.join(RENDERER_DIST, 'index.html'));
    win.loadFile(path.join(RENDERER_DIST, 'index.html')).catch(error => {
      console.error('Error loading file:', error);
    });
  }

  win.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('Preload error:', preloadPath, error);
  });

  win.webContents.on('render-process-gone', (event, details) => {
    console.error('Render process gone:', details);
  });

  onWebContentsCrashed(win.webContents, () => {
    console.error('Renderer process crashed');
  });
}

// Cleanup temporary files on app close
function cleanupTempFiles() {
  try {
    const tempDir = getSafeTempDir();
    const screenshotsDir = getScreenshotsDir();
    
    // Clean up screenshots directory
    if (fs.existsSync(screenshotsDir)) {
      const files = fs.readdirSync(screenshotsDir);
      files.forEach(file => {
        try {
          fs.unlinkSync(path.join(screenshotsDir, file));
        } catch (error: unknown) {
          console.warn('Failed to delete screenshot:', file, error);
        }
      });
      try {
        fs.rmdirSync(screenshotsDir);
      } catch (error: unknown) {
        console.warn('Failed to remove screenshots directory', error);
      }
    }
    
    // Clean up video files (look for files matching recording_*.webm pattern)
    const tempFiles = fs.readdirSync(tempDir);
    tempFiles.forEach(file => {
      if (file.startsWith('recording_') && file.endsWith('.webm')) {
        try {
          fs.unlinkSync(path.join(tempDir, file));
        } catch (error: unknown) {
          console.warn('Failed to delete video file:', file, error);
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
  // Only quit if not in development mode or if explicitly closed
  // In development, keep the app running for faster reload cycles
  if (process.env.NODE_ENV === 'production' && process.platform !== 'darwin') {
    cleanupTempFiles();
    app.quit();
    win = null;
  } else if (process.platform === 'darwin') {
    // macOS convention: keep app running when all windows closed
    console.log('All windows closed, app remains running (macOS)');
  } else {
    console.log('All windows closed, app remains running (development mode)');
  }
});

onAppWindowAllClosedBeforeQuit(app, () => {
  // Fallback cleanup
  try {
    cleanupTempFiles();
  } catch (error: unknown) {
    console.error('Error during cleanup:', error);
  }
});

app.on('before-quit', () => {
  console.log('App is about to quit, performing cleanup...');
  try {
    cleanupTempFiles();
  } catch (error: unknown) {
    console.error('Error during cleanup:', error);
  }
});

app.on('quit', () => {
  console.log('App has quit');
  win = null;
});

// Handle uncaught exceptions in main process
process.on('uncaughtException', (error: Error) => {
  console.error('Uncaught exception in main process:', error);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(() => {
  try {
    createWindow();
    if (win) {
      setupIpcHandlers(win);
    }
  } catch (error: unknown) {
    console.error('Error during app initialization:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    }
  }
});
