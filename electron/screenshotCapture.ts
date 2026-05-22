// @ts-nocheck
import screenshot from 'screenshot-desktop';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';

export async function captureScreenshot(): Promise<string | null> {
  try {
    const tempDir = app.getPath('temp');
    const screenshotsDir = path.join(tempDir, 'screenshots');
    
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const filename = `screenshot_${Date.now()}_${uuidv4()}.png`;
    const filePath = path.join(screenshotsDir, filename);

    await screenshot({ filename: filePath });
    return filePath;
  } catch (err) {
    console.error('Failed to capture screenshot:', err);
    return null;
  }
}
