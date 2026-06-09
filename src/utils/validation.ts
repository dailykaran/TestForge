import { GoogleGenAI } from '@google/genai';

/**
 * Input validation utilities for client-side validation
 */

/**
 * Validates an API key format (basic check)
 * For Gemini: Now does basic validation only; full validation happens at runtime
 * For Claude: Validates "sk-ant-" prefix format
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
    // Basic validation for Gemini - just check minimum length
    // Full validation happens at runtime when saving
    return trimmed.length > 20;
  } else if (type === 'claude') {
    // Claude keys should start with 'sk-ant-'
    return trimmed.length > 20 && trimmed.startsWith('sk-ant-');
  }

  return false;
}

/**
 * Validates a Gemini API key by making a test request to the API
 * This ensures the key actually works with the Gemini API
 * @param apiKey - The Google API key to validate
 * @returns Promise with { valid: boolean; error?: string }
 */
export async function validateGeminiApiKeyAtRuntime(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  if (!apiKey?.trim()) {
    return { valid: false, error: 'API key cannot be empty' };
  }

  if (apiKey.trim().length < 20) {
    return { valid: false, error: 'API key is too short' };
  }

  try {
    // Initialize Gemini API with the provided key
    const genAI = new GoogleGenAI({ apiKey: apiKey.trim() });

    // Make a minimal test request (just 1 token, negligible cost)
    await genAI.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: [
        {
          parts: [{ text: 'test' }],
        },
      ],
    });

    return { valid: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Map common API errors to user-friendly messages
    if (errorMessage.includes('API key not valid')) {
      return { valid: false, error: 'Invalid API key. Please check and try again.' };
    }
    if (errorMessage.includes('API_KEY_INVALID')) {
      return { valid: false, error: 'Invalid API key format or credentials.' };
    }
    if (errorMessage.includes('permission denied') || errorMessage.includes('not enabled')) {
      return {
        valid: false,
        error: 'Gemini API is not enabled for this project. Enable it in Google Cloud Console.'
      };
    }
    if (errorMessage.includes('quota') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      return { valid: false, error: 'API quota exceeded. Please check your Google Cloud billing.' };
    }
    if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND')) {
      return { valid: false, error: 'Network error. Check your internet connection.' };
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return { valid: false, error: 'Request timeout. Please try again.' };
    }

    // Generic error fallback
    return {
      valid: false,
      error: `Failed to validate API key: ${errorMessage.substring(0, 100)}`
    };
  }
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
