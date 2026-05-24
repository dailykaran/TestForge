/**
 * IPC Channel Definitions
 * Defines all permitted IPC channels for secure communication between
 * main process and renderer process. All IPC calls must use channels from this list.
 */

export const IPC_CHANNELS = {
  // Desktop capture and recording
  'get-desktop-sources': 'get-desktop-sources',
  'save-video': 'save-video',

  // File operations (safe, validated paths)
  'read-file-base64': 'read-file-base64',
  'download-file': 'download-file',

  // Action observation
  'start-observing': 'start-observing',
  'stop-observing': 'stop-observing',
  'action-captured': 'action-captured',
  'set-generator-active': 'set-generator-active',

  // Session memory
  'session-memory-clear': 'session-memory-clear',

  // API Key Management (secure)
  'get-gemini-api-key': 'get-gemini-api-key',
  'get-claude-api-key': 'get-claude-api-key',
  'set-gemini-api-key': 'set-gemini-api-key',
  'set-claude-api-key': 'set-claude-api-key',
  'clear-api-keys': 'clear-api-keys',

  // Test Case Generation (moved to main process)
  'generate-test-cases': 'generate-test-cases',

  // Sensitive data warning
  'user-consent-screenshot': 'user-consent-screenshot',
  // Automated test reporting channel (used by CI/local harness)
  'ipc-auto-test-result': 'ipc-auto-test-result',
} as const;

/**
 * Get all allowed channels for validation
 */
export function getAllowedChannels(): string[] {
  return Object.values(IPC_CHANNELS);
}

/**
 * Validates if a channel is allowed
 */
export function isChannelAllowed(channel: string): boolean {
  return getAllowedChannels().includes(channel);
}
