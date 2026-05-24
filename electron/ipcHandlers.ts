import { app, ipcMain, desktopCapturer, BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { startObserving, stopObserving, setObserverWindow, setGeneratorActive } from './actionObserver';
import { validateTempPath, sanitizeFilename, ensureSafeDirExists, getSafeTempDir } from './pathValidator';
import { IPC_CHANNELS } from './ipcChannels';
import { getGeminiApiKey, setGeminiApiKey, getClaudeApiKey, setClaudeApiKey, clearAllApiKeys } from './keyStore';
import { generateTestCasesWithGemini } from './geminiApiHandler';
import { generateTestCasesWithClaude } from './claudeApiHandler';

export function setupIpcHandlers(win: BrowserWindow) {
  try {
    setObserverWindow(win);
    ensureSafeDirExists();
  } catch (error: unknown) {
    console.error('Error during IPC setup initialization:', error);
  }

  try {
    ipcMain.handle(IPC_CHANNELS['get-desktop-sources'], async () => {
      const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 400, height: 400 } });
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL()
      }));
    });
  } catch (error: unknown) {
    console.error('Error registering get-desktop-sources handler:', error);
  }

  ipcMain.handle(IPC_CHANNELS['save-video'], async (_, buffer: Buffer) => {
    try {
      const tempDir = getSafeTempDir();
      const filename = sanitizeFilename(`recording_${Date.now()}.webm`);
      const filePath = path.join(tempDir, filename);
      
      // Validate the path is within safe temp directory
      const validatedPath = validateTempPath(filePath);
      if (!validatedPath) {
        throw new Error('Invalid video path - validation failed');
      }
      
      console.log(`Saving video to: ${validatedPath}, buffer size: ${buffer.length} bytes`);
      fs.writeFileSync(validatedPath, buffer);
      
      // Verify file was written
      if (!fs.existsSync(validatedPath)) {
        throw new Error('Video file was not created');
      }
      
      const stats = fs.statSync(validatedPath);
      console.log(`Video saved successfully: ${validatedPath}, file size: ${stats.size} bytes`);
      return validatedPath;
    } catch (error: unknown) {
      console.error('Error saving video:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to save video: ${error.message}`, { cause: error });
      }
      throw new Error('Failed to save video: Unknown error occurred', { cause: error });
    }
  });

  ipcMain.on(IPC_CHANNELS['start-observing'], () => {
    startObserving();
  });

  ipcMain.on(IPC_CHANNELS['stop-observing'], () => {
    stopObserving();
  });

  ipcMain.on(IPC_CHANNELS['set-generator-active'], (_, active: boolean) => {
    setGeneratorActive(active);
  });

  ipcMain.on(IPC_CHANNELS['session-memory-clear'], () => {
    console.log('Session memory clear event received from renderer');
    // Session memory (Zustand store) will be garbage collected
    // This is primarily for logging purposes
  });

  // SECURITY: Validated file reading - prevents directory traversal
  ipcMain.handle(IPC_CHANNELS['read-file-base64'], (_, filePath: string) => {
    try {
      const validatedPath = validateTempPath(filePath);
      if (!validatedPath) {
        console.warn(`Path validation failed for file: ${filePath}`);
        return '';
      }
      if (!fs.existsSync(validatedPath)) {
        console.warn(`File does not exist: ${validatedPath}`);
        return '';
      }
      const buffer = fs.readFileSync(validatedPath);
      if (buffer.length === 0) {
        console.warn(`File is empty: ${validatedPath}`);
        return '';
      }
      const base64 = buffer.toString('base64');
      console.log(`Successfully read file: ${validatedPath}, size: ${buffer.length} bytes, base64 length: ${base64.length}`);
      return base64;
    } catch (error: unknown) {
      console.error('Error reading file:', error);
      return '';
    }
  });

  // SECURITY: Validated file download - prevents unauthorized file access
  ipcMain.handle(IPC_CHANNELS['download-file'], async (event, sourcePath: string) => {
    try {
      if (!sourcePath) {
        throw new Error('No video path provided');
      }
      
      const validatedSourcePath = validateTempPath(sourcePath);
      if (!validatedSourcePath || !fs.existsSync(validatedSourcePath)) {
        console.warn(`Unauthorized download attempt: ${sourcePath}`);
        throw new Error('Video file not found or access denied');
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
        fs.copyFileSync(validatedSourcePath, filePath);
        return { success: true, message: `Video saved to ${filePath}` };
      } else {
        return { success: false, message: 'Save canceled' };
      }
    } catch (error: unknown) {
      console.error('Download file error:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to save video: ${error.message}`, { cause: error });
      }
      throw new Error('Failed to save video: Unknown error occurred', { cause: error });
    }
  });

  // SECURITY: API Key Management using OS Keychain
  ipcMain.handle(IPC_CHANNELS['get-gemini-api-key'], async () => {
    try {
      const key = await getGeminiApiKey();
      return key ? true : false; // Only return boolean to prevent key exposure
    } catch (error: unknown) {
      console.error('Error retrieving Gemini API key:', error);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS['get-claude-api-key'], async () => {
    try {
      const key = await getClaudeApiKey();
      return key ? true : false; // Only return boolean to prevent key exposure
    } catch (error: unknown) {
      console.error('Error retrieving Claude API key:', error);
      return false;
    }
  });

  ipcMain.handle(IPC_CHANNELS['set-gemini-api-key'], async (_, apiKey: string) => {
    try {
      await setGeminiApiKey(apiKey);
      return { success: true, message: 'Gemini API key saved securely' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error saving Gemini API key:', error);
      return { success: false, message: errorMessage };
    }
  });

  ipcMain.handle(IPC_CHANNELS['set-claude-api-key'], async (_, apiKey: string) => {
    try {
      await setClaudeApiKey(apiKey);
      return { success: true, message: 'Claude API key saved securely' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error saving Claude API key:', error);
      return { success: false, message: errorMessage };
    }
  });

  ipcMain.handle(IPC_CHANNELS['clear-api-keys'], async () => {
    try {
      await clearAllApiKeys();
      return { success: true, message: 'API keys cleared' };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('Error clearing API keys:', error);
      return { success: false, message: errorMessage };
    }
  });

  // SECURITY: Test case generation moved to main process (away from browser context)
  ipcMain.handle(IPC_CHANNELS['generate-test-cases'], async (_, actionData: unknown) => {
    const data = actionData as { actions: unknown; screenshots: unknown; modelName: string };
    const { actions, screenshots, modelName } = data;
    try {
      if (modelName && modelName.includes('gemini')) {
        return await generateTestCasesWithGemini(actions as never, screenshots as never, modelName);
      } else {
        return await generateTestCasesWithClaude(actions as never, screenshots as never, modelName);
      }
    } catch (error: unknown) {
      console.error('Error generating test cases:', error);
      throw error;
    }
  });

  // Automated test result reporting from renderer (CI/harness)
  try {
    ipcMain.on(IPC_CHANNELS['ipc-auto-test-result'], (event, result: unknown) => {
      console.log('ipc-auto-test-result received from renderer:', result);
      try {
        const obj = result as { status?: string; message?: string };
        if (obj.status === 'success') {
          console.log('Automated IPC test reported success — exiting app with code 0');
          setTimeout(() => app.exit(0), 200);
        } else {
          console.error('Automated IPC test reported failure:', obj.message || obj);
          setTimeout(() => app.exit(2), 200);
        }
      } catch (err) {
        console.error('Error handling ipc-auto-test-result payload:', err);
        setTimeout(() => app.exit(3), 200);
      }
    });
  } catch (err) {
    console.error('Failed to register ipc-auto-test-result handler:', err);
  }
}
