/**
 * Session Memory Management
 * 
 * This file provides utilities for managing temporary session-based data
 * that automatically clears when the testcase-recorder app is closed.
 * 
 * Session memory is stored in-memory using Zustand and does NOT persist
 * across app restarts or window refreshes.
 */

/**
 * Notifies the main process that the session is being cleared
 * Call this before app close to ensure all session data is flushed
 */
export function notifySessionClear() {
  if (window.ipcRenderer) {
    window.ipcRenderer.send('session-memory-clear');
  }
}

/**
 * Gets the current session start time
 * Useful for calculating session duration
 */
export function getSessionStartTime(): number {
  try {
    const timestamp = sessionStorage.getItem('session_start_time');
    if (timestamp) {
      return parseInt(timestamp, 10);
    }
  } catch {
    console.warn('Could not retrieve session start time from sessionStorage');
  }
  return Date.now();
}

/**
 * Sets the session start time in sessionStorage
 * This persists during the current browser session but clears on close
 */
export function setSessionStartTime(time: number) {
  try {
    sessionStorage.setItem('session_start_time', String(time));
  } catch {
    console.warn('Could not store session start time in sessionStorage');
  }
}

/**
 * Gets session duration in milliseconds
 */
export function getSessionDuration(): number {
  return Date.now() - getSessionStartTime();
}

/**
 * Clears all session storage data
 * Called automatically when the app is closed
 */
export function clearSessionStorage() {
  try {
    sessionStorage.clear();
  } catch {
    console.warn('Could not clear sessionStorage');
  }
}
