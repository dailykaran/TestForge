/**
 * Input validation utilities for client-side validation
 */

/**
 * Validates an API key format (basic check)
 * @param key - The API key to validate
 * @param type - Type of API key ('gemini' or 'claude')
 * @returns true if valid format, false otherwise
 */
export function isValidApiKeyFormat(key: string, type: 'gemini' | 'claude'): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  const trimmed = key.trim();
  
  if (type === 'gemini') {
    // Gemini keys typically start with 'AIza'
    return trimmed.length > 20 && trimmed.startsWith('AIza');
  } else if (type === 'claude') {
    // Claude keys typically start with 'sk-ant-'
    return trimmed.length > 20 && trimmed.startsWith('sk-ant-');
  }

  return false;
}

/**
 * Validates a file path doesn't contain suspicious patterns
 * @param filePath - The file path to validate
 * @returns true if safe, false if contains suspicious patterns
 */
export function isSafeFilePath(filePath: string): boolean {
  if (!filePath || typeof filePath !== 'string') {
    return false;
  }

  // Check for path traversal attempts
  const suspiciousPatterns = ['..', '\\', '//', '~', '$', '`', ';', '|', '&'];
  
  return !suspiciousPatterns.some(pattern => filePath.includes(pattern));
}

/**
 * Validates an action object
 * @param action - The action to validate
 * @returns true if valid, false otherwise
 */
export function isValidAction(action: unknown): boolean {
  if (!action || typeof action !== 'object') {
    return false;
  }
  const a = action as Record<string, unknown>;

  // Check required fields
  if (!('id' in a) || !('type' in a) || !('label' in a) || !('timestamp' in a)) {
    return false;
  }

  // Validate types
  if (typeof a.id !== 'string' || typeof a.type !== 'string' ||
      typeof a.label !== 'string' || typeof a.timestamp !== 'number') {
    return false;
  }

  // Validate coordinates if present
  if (a.coordinates) {
    const coords = a.coordinates as Record<string, unknown>;
    if (typeof coords.x !== 'number' || typeof coords.y !== 'number') {
      return false;
    }
    if (coords.x < 0 || coords.y < 0) {
      return false;
    }
  }

  return true;
}

/**
 * Sanitizes user input string
 * @param input - The input to sanitize
 * @param maxLength - Maximum length allowed
 * @returns Sanitized string
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // Remove potentially dangerous characters but keep reasonable text
  return input
    .slice(0, maxLength)
    .replace(/[<>'"]/g, '') // Remove HTML/script characters
    .trim();
}

/**
 * Validates that a value is a reasonable number within bounds
 * @param value - The value to validate
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (inclusive)
 * @returns true if valid number within bounds
 */
export function isValidNumberInRange(value: unknown, min: number, max: number): boolean {
  if (typeof value !== 'number' || isNaN(value)) {
    return false;
  }
  return value >= min && value <= max;
}

/**
 * Validates a timestamp is reasonable (not too far in past/future)
 * @param timestamp - The timestamp to validate
 * @returns true if reasonable, false otherwise
 */
export function isValidTimestamp(timestamp: unknown): boolean {
  if (typeof timestamp !== 'number' || isNaN(timestamp)) {
    return false;
  }

  const now = Date.now();
  const oneHourMs = 60 * 60 * 1000;
  const oneDayMs = 24 * oneHourMs;

  // Timestamp should be within last 24 hours or future by 1 hour max
  return timestamp >= now - oneDayMs && timestamp <= now + oneHourMs;
}
