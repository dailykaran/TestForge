import Anthropic from '@anthropic-ai/sdk';
import { ActionEvent } from '../src/types';
import { getClaudeApiKey } from './keyStore';
import { claude } from '../src/config/prompts';

// SYSTEM_PROMPT is now imported from src/config/prompts/claude/standard.ts
const SYSTEM_PROMPT = claude.CLAUDE_STANDARD_PROMPT;

const MAX_TOKENS = 4096;

/**
 * Formats action events into a readable text log
 */
function formatActionsToText(actions: ActionEvent[]): string {
  return actions
    .map(a => 
      `[${new Date(a.timestamp).toISOString()}] [${a.type.toUpperCase()}] — ${a.label} | Coords: ${
        a.coordinates ? `${a.coordinates.x},${a.coordinates.y}` : 'N/A'
      }`
    )
    .join('\n');
}

/**
 * Generates test cases using Claude API (called from main process)
 * @param actions - Array of recorded user actions
 * @param screenshots - Array of base64-encoded screenshot strings
 * @param modelName - Model to use (default: claude-3-5-sonnet-20241022)
 * @returns Promise resolving to generated test cases as string
 */
export async function generateTestCasesWithClaude(
  actions: ActionEvent[],
  screenshots: string[],
  modelName: string = 'claude-3-5-sonnet-20241022'
): Promise<string> {
  try {
    // Get API key securely from OS keychain
    const apiKey = await getClaudeApiKey();
    if (!apiKey?.trim()) {
      throw new Error('Claude API key not found. Please configure it in Settings.');
    }

    if (actions.length === 0) {
      throw new Error('No actions provided for test case generation');
    }

    // Create client WITHOUT dangerouslyAllowBrowser flag (safe in main process)
    const client = new Anthropic({ apiKey });

    // Build image content array
    const imageContent = screenshots
      .filter(b64 => b64?.trim())
      .map(b64 => ({
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          media_type: 'image/png' as const,
          data: b64,
        },
      }));

    const actionLog = formatActionsToText(actions);
    const userPrompt = `ACTION LOG:\n${actionLog}\n\nGenerate complete test cases based on this session.`;

    const response = await client.messages.create({
      model: modelName,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text: userPrompt,
            },
          ],
        },
      ],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      throw new Error('No text response received from Claude API');
    }

    return textBlock.text || '';
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to generate test cases with Claude: ${error.message}`, { cause: error });
    }
    throw error;
  }
}
