import Anthropic from '@anthropic-ai/sdk';
import { ActionEvent } from '../types.ts';

const SYSTEM_PROMPT = `
You are a professional QA Engineer and Test Architect.
Your task is to analyze a sequence of user interactions recorded from a screen recording session and generate formal, structured software test cases.

Each test case must follow this structure:
- Test Case ID: TC_[number]
- Test Case Name: [Descriptive Name]
- Module / Feature: [Inferred from actions]
- Preconditions: [What must be true before the test]
- Test Steps: [Numbered, atomic steps]
- Expected Results: [Clear, verifiable outcomes]
- Priority: [High / Medium / Low]
- Test Type: [Functional / UI / Navigation / Regression]
`;

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
 * Generates test cases using Claude API via Anthropic SDK
 * @param actions - Array of recorded user actions
 * @param screenshots - Array of base64-encoded screenshot strings
 * @param apiKey - Anthropic API key for authentication
 * @param modelName - Model to use (default: claude-3-5-sonnet-20241022)
 * @returns Promise resolving to generated test cases as string
 */
export async function generateTestCasesWithClaude(
  actions: ActionEvent[],
  screenshots: string[],
  apiKey: string,
  modelName: string = 'claude-3-5-sonnet-20241022'
): Promise<string> {
  try {
    if (!apiKey?.trim()) {
      throw new Error('API key is required');
    }

    if (actions.length === 0) {
      throw new Error('No actions provided for test case generation');
    }

    const client = new Anthropic({ 
      apiKey, 
      dangerouslyAllowBrowser: true,
    });

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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to generate test cases with Claude: ${errorMessage}`);
  }
}
