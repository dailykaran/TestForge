import { ipcMain, desktopCapturer, app, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { startObserving, stopObserving, setObserverWindow, setGeneratorActive } from './actionObserver';

export function setupIpcHandlers(win: BrowserWindow) {
  setObserverWindow(win);

  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 400, height: 400 } });
    return sources.map(source => ({
      id: source.id,
      name: source.name,
      thumbnail: source.thumbnail.toDataURL()
    }));
  });

  ipcMain.handle('save-video', async (_, buffer: Buffer) => {
    const tempDir = app.getPath('temp');
    const filePath = path.join(tempDir, `recording_${Date.now()}.webm`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  ipcMain.on('start-observing', () => {
    startObserving();
  });

  ipcMain.on('stop-observing', () => {
    stopObserving();
  });

  ipcMain.on('set-generator-active', (_, active: boolean) => {
    setGeneratorActive(active);
  });

  ipcMain.on('session-memory-clear', () => {
    console.log('Session memory clear event received from renderer');
    // Session memory (Zustand store) will be garbage collected
    // This is primarily for logging purposes
  });

  ipcMain.handle('read-file-base64', (_, filePath: string) => {
    try {
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        return buffer.toString('base64');
      }
    } catch(e) { }
    return '';
  });

  ipcMain.handle('download-file', async (event, sourcePath: string) => {
    try {
      if (!sourcePath) {
        throw new Error('No video path provided');
      }
      if (!fs.existsSync(sourcePath)) {
        throw new Error('Video file not found');
      }
      const windowContext = BrowserWindow.fromWebContents(event.sender);
      if (!windowContext) {
        throw new Error('Window context not found');
      }
      const { canceled, filePath } = await dialog.showSaveDialog(windowContext, {
        defaultPath: `recording_${Date.now()}.webm`,
        filters: [{ name: 'Videos', extensions: ['webm'] }]
      });
      if (!canceled && filePath) {
        fs.copyFileSync(sourcePath, filePath);
        return { success: true, message: `Video saved to ${filePath}` };
      } else {
        return { success: false, message: 'Save canceled' };
      }
    } catch (error: any) {
      console.error('Download file error:', error);
      throw new Error(`Failed to save video: ${error.message}`);
    }
  });
}
