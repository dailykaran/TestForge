interface Keytar {
  setPassword(service: string, account: string, password: string): Promise<void>;
  getPassword(service: string, account: string): Promise<string | null>;
  deletePassword(service: string, account: string): Promise<void>;
}

let keytar: Keytar | null = null;
let keytarError: Error | null = null;

async function ensureKeytar() {
  if (keytar) return keytar;
  
  if (keytarError) {
    throw keytarError;
  }
  
  try {
    // Use dynamic import to load keytar (it's an optional native module)
    // This works in ESM environments unlike require()
    keytar = await import('keytar').then(m => m.default || m) as unknown as Keytar;
    return keytar;
  } catch (error: unknown) {
    console.warn('Failed to import keytar as ESM:', error);
    // Last resort: preserve the original error when possible
    keytarError = error instanceof Error ? error : new Error(String(error));
    throw keytarError;
  }
}

const SERVICE_NAME = 'TestForge';
const GEMINI_KEY_ACCOUNT = 'gemini-api-key';
const CLAUDE_KEY_ACCOUNT = 'claude-api-key';

/**
 * Secure key storage using OS keychain
 * - Windows: Credential Manager
 * - macOS: Keychain
 * - Linux: Secret Service
 */

export async function setGeminiApiKey(apiKey: string): Promise<void> {
  if (!apiKey?.trim()) {
    await deleteGeminiApiKey();
    return;
  }
  try {
    const kt = await ensureKeytar();
    await kt.setPassword(SERVICE_NAME, GEMINI_KEY_ACCOUNT, apiKey);
  } catch (error: unknown) {
    console.error('Failed to store Gemini API key:', error);
    throw error;
  }
}

export async function getGeminiApiKey(): Promise<string | null> {
  try {
    const kt = await ensureKeytar();
    return await kt.getPassword(SERVICE_NAME, GEMINI_KEY_ACCOUNT);
  } catch (error: unknown) {
    console.error('Failed to retrieve Gemini API key:', error);
    return null;
  }
}

export async function deleteGeminiApiKey(): Promise<void> {
  try {
    const kt = await ensureKeytar();
    await kt.deletePassword(SERVICE_NAME, GEMINI_KEY_ACCOUNT);
  } catch (error: unknown) {
    console.error('Failed to delete Gemini API key:', error);
  }
}

export async function setClaudeApiKey(apiKey: string): Promise<void> {
  if (!apiKey?.trim()) {
    await deleteClaudeApiKey();
    return;
  }
  try {
    const kt = await ensureKeytar();
    await kt.setPassword(SERVICE_NAME, CLAUDE_KEY_ACCOUNT, apiKey);
  } catch (error: unknown) {
    console.error('Failed to store Claude API key:', error);
    throw error;
  }
}

export async function getClaudeApiKey(): Promise<string | null> {
  try {
    const kt = await ensureKeytar();
    return await kt.getPassword(SERVICE_NAME, CLAUDE_KEY_ACCOUNT);
  } catch (error: unknown) {
    console.error('Failed to retrieve Claude API key:', error);
    return null;
  }
}

export async function deleteClaudeApiKey(): Promise<void> {
  try {
    const kt = await ensureKeytar();
    await kt.deletePassword(SERVICE_NAME, CLAUDE_KEY_ACCOUNT);
  } catch (error: unknown) {
    console.error('Failed to delete Claude API key:', error);
  }
}

export async function clearAllApiKeys(): Promise<void> {
  await Promise.all([deleteGeminiApiKey(), deleteClaudeApiKey()]);
}
