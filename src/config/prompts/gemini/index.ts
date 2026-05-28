/**
 * Gemini Prompts Export
 * Central export point for all Gemini-related prompts
 */

import { GEMINI_DETAILED_PROMPT } from './detailed';
import { GEMINI_SIMPLE_PROMPT } from './simple';

export { GEMINI_DETAILED_PROMPT, GEMINI_SIMPLE_PROMPT };

/**
 * Prompt mode selector for Gemini
 * - 'detailed': 15KB comprehensive prompt with extensive examples (used in electron/geminiApiHandler.ts)
 * - 'simple': 2.5KB lightweight prompt focused on UI text (used in src/services/geminiService.ts)
 */
export type GeminiPromptMode = 'detailed' | 'simple';

/**
 * Get Gemini prompt based on mode
 * @param mode - 'detailed' for comprehensive prompt, 'simple' for lightweight version
 * @returns The selected Gemini prompt
 */
export function getGeminiPrompt(mode: GeminiPromptMode = 'detailed'): string {
  const prompts = {
    detailed: GEMINI_DETAILED_PROMPT,
    simple: GEMINI_SIMPLE_PROMPT,
  };
  return prompts[mode];
}

// Export default detailed prompt for backward compatibility
export const DEFAULT_GEMINI_PROMPT = GEMINI_DETAILED_PROMPT;
