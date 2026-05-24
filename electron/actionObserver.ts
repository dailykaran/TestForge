import { uIOhook } from 'uiohook-napi';

type UiohookMouseEvent = {
  type: number;
  x: number;
  y: number;
  button?: number;
  clicks?: number;
};

type UiohookKeyboardEvent = {
  type: number;
  keycode: number;
  rawcode?: number;
  mask?: number;
};

type UiohookWheelEvent = {
  type: number;
  amount?: number;
  rotation: number;
  direction?: number;
};
import { captureScreenshot } from './screenshotCapture';
import { BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';

export enum ActionType {
  CLICK = 'click',
  DOUBLE_CLICK = 'double_click',
  RIGHT_CLICK = 'right_click',
  KEY_PRESS = 'key_press',
  SCROLL = 'scroll',
  DRAG = 'drag',
  WINDOW_OPEN = 'window_open',
  NAVIGATION = 'navigation',
  INPUT = 'input',
  DROPDOWN = 'dropdown',
  SCREENSHOT_TRIGGER = 'screenshot_trigger',
}

export interface ActionEvent {
  id: string;
  timestamp: number;
  type: ActionType;
  label: string;
  coordinates?: { x: number; y: number };
  keyCombo?: string;
  screenshotPath?: string;
  windowTitle?: string;
  url?: string;
  elementHint?: string;
}

let isObserving = false;
let mainWindow: BrowserWindow | null = null;
let lastScrollTime = 0;
let isGeneratorActive = false;

export function setObserverWindow(win: BrowserWindow) {
  mainWindow = win;
}

export function setGeneratorActive(active: boolean) {
  isGeneratorActive = active;
}

function sendAction(action: ActionEvent) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('action-captured', action);
  }
}

export function startObserving() {
  if (isObserving) return;
  isObserving = true;

  uIOhook.on('click', async (e: UiohookMouseEvent) => {
    if (e.button === 1 && !isGeneratorActive) {
      const screenshotPath = await captureScreenshot();
      sendAction({
        id: uuidv4(),
        timestamp: Date.now(),
        type: ActionType.CLICK,
        label: 'Mouse Click',
        coordinates: { x: e.x, y: e.y },
        screenshotPath: screenshotPath || undefined
      });
    }
  });

  uIOhook.on('keydown', (e: UiohookKeyboardEvent) => {
    if (!isGeneratorActive) {
      sendAction({
        id: uuidv4(),
        timestamp: Date.now(),
        type: ActionType.KEY_PRESS,
        label: 'Key Press',
        keyCombo: e.keycode.toString()
      });
    }
  });

  uIOhook.on('wheel', (e: UiohookWheelEvent) => {
    const now = Date.now();
    if (now - lastScrollTime > 3000 && !isGeneratorActive) {
      lastScrollTime = now;
      sendAction({
        id: uuidv4(),
        timestamp: Date.now(),
        type: ActionType.SCROLL,
        label: e.rotation > 0 ? 'Scroll Down' : 'Scroll Up',
      });
    }
  });

  try {
    uIOhook.start();
  } catch (err) {
    console.error("Failed to start uIOhook:", err);
  }
}

export function stopObserving() {
  if (!isObserving) return;
  isObserving = false;
  try {
    uIOhook.stop();
  } catch (error: unknown) {
    console.warn('Failed to stop uIOhook', error);
  }
}
