declare module 'uiohook-napi' {
  export interface UiohookMouseEvent {
    type: number;
    x: number;
    y: number;
    button?: number;
    clicks?: number;
  }

  export interface UiohookKeyboardEvent {
    type: number;
    keycode: number;
    rawcode?: number | undefined;
    mask?: number | undefined;
  }

  export interface UiohookWheelEvent {
    type: number;
    amount?: number;
    rotation: number;
    direction?: number | undefined;
  }

  export const uIOhook: {
    on(event: string, listener: (...args: unknown[]) => void): void;
    start(): void;
    stop(): void;
  };

  export default uIOhook;
}
