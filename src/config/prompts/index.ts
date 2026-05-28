/**
 * Central Prompts Configuration
 * Single entry point for all AI provider prompts
 * 
 * Usage:
 * - import { gemini, claude } from 'src/config/prompts'
 * - Use gemini.DETAILED_PROMPT or gemini.SIMPLE_PROMPT
 * - Use claude.STANDARD_PROMPT
 */

export * as gemini from './gemini';
export * as claude from './claude';
