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
  type: ActionType | string;
  label: string;
  coordinates?: { x: number; y: number };
  keyCombo?: string;
  screenshotPath?: string;
  windowTitle?: string;
  url?: string;
  elementHint?: string;
}
