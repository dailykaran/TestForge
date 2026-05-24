import path from 'path';
import fs from 'fs';
import { app } from 'electron';

/**
 * Path validation utility to prevent directory traversal and unauthorized file access
 * All file operations should use these validators
 */

/**
 * Gets the safe base directory for storing temporary files
 */
export function getSafeTempDir(): string {
  return path.join(app.getPath('temp'), 'testforge');
}

/**
 * Gets the safe screenshots directory
 */
export function getScreenshotsDir(): string {
  return path.join(getSafeTempDir(), 'screenshots');
}

/**
 * Validates and sanitizes a file path to prevent directory traversal attacks
 * @param inputPath - The path to validate
 * @param allowedBaseDir - The directory the path must be within
 * @returns Validated absolute path, or null if invalid
 */
export function validatePath(inputPath: string, allowedBaseDir: string): string | null {
  if (!inputPath || typeof inputPath !== 'string') {
    return null;
  }

  try {
    // Normalize and resolve the path
    const resolvedPath = path.resolve(inputPath);
    const resolvedBase = path.resolve(allowedBaseDir);
    
    // Normalize for comparison: convert backslashes to forward slashes and ensure trailing separator
    const normalizedPath = resolvedPath.replace(/\\/g, '/').toLowerCase();
    const normalizedBase = (resolvedBase.replace(/\\/g, '/') + '/').toLowerCase();

    // Ensure the resolved path is within the allowed base directory
    if (!normalizedPath.startsWith(normalizedBase)) {
      console.warn(`Path traversal attempt detected: ${inputPath}`);
      return null;
    }

    // Additional check: verify the path doesn't escape using .. after resolution
    const relative = path.relative(resolvedBase, resolvedPath);
    if (relative.startsWith('..')) {
      console.warn(`Invalid path relative traversal: ${inputPath}`);
      return null;
    }

    return resolvedPath;
  } catch (error) {
    console.warn(`Path validation error for: ${inputPath}`, error);
    return null;
  }
}

/**
 * Validates a file path within the temp directory
 * @param filePath - Path to validate
 * @returns Validated path or null if invalid
 */
export function validateTempPath(filePath: string): string | null {
  return validatePath(filePath, getSafeTempDir());
}

/**
 * Validates a screenshot file path
 * @param filePath - Path to validate
 * @returns Validated path or null if invalid
 */
export function validateScreenshotPath(filePath: string): string | null {
  return validatePath(filePath, getScreenshotsDir());
}

/**
 * Validates a video file path
 * @param filePath - Path to validate
 * @returns Validated path or null if invalid
 */
export function validateVideoPath(filePath: string): string | null {
  return validatePath(filePath, getSafeTempDir());
}

/**
 * Sanitizes a filename to remove potentially dangerous characters
 * @param filename - The filename to sanitize
 * @returns Sanitized filename
 */
export function sanitizeFilename(filename: string): string {
  // Remove path separators, null bytes, and other dangerous characters
  return filename
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .replace(/[<>:"|?*]/g, '_') // Replace Windows reserved characters
    .replace(/\.\./g, '_') // Replace parent directory references
    .replace(/\/\\\\/g, '_') // Replace path separators
    .trim();
}

/**
 * Ensures the safe temp directory exists
 */
export function ensureSafeDirExists(): void {
  const tempDir = getSafeTempDir();
  const screenshotsDir = getScreenshotsDir();

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
}

/**
 * Safely deletes a file after validating it's in the allowed directory
 * @param filePath - Path to delete
 * @returns true if deleted, false if invalid path
 */
export function safeDeleteFile(filePath: string): boolean {
  const validatedPath = validateTempPath(filePath);
  if (!validatedPath || !fs.existsSync(validatedPath)) {
    return false;
  }

  try {
    fs.unlinkSync(validatedPath);
    return true;
  } catch (error) {
    console.error(`Failed to delete file: ${validatedPath}`, error);
    return false;
  }
}

/**
 * Safely reads a file after validating it's in the allowed directory
 * @param filePath - Path to read
 * @returns File contents or null if invalid
 */
export function safeReadFile(filePath: string): Buffer | null {
  const validatedPath = validateTempPath(filePath);
  if (!validatedPath || !fs.existsSync(validatedPath)) {
    return null;
  }

  try {
    return fs.readFileSync(validatedPath);
  } catch (error) {
    console.error(`Failed to read file: ${validatedPath}`, error);
    return null;
  }
}
