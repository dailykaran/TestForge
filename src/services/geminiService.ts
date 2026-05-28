import { GoogleGenAI } from '@google/genai';
import { ActionEvent } from '../types.ts';
import { gemini } from '../config/prompts';

// SYSTEM_PROMPT is now imported from src/config/prompts/gemini/simple.ts (lightweight version for browser)
const SYSTEM_PROMPT = gemini.GEMINI_SIMPLE_PROMPT;

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
 * Generates test cases using Google's Gemini API
 * @param actions - Array of recorded user actions
 * @param screenshots - Array of base64-encoded screenshot strings
 * @param apiKey - Google API key for authentication
 * @param modelName - Model to use (default: gemini-2.0-flash)
 * @returns Promise resolving to generated test cases as string
 */
export async function generateTestCasesWithGemini(
  actions: ActionEvent[],
  screenshots: string[],
  apiKey: string,
  modelName: string = 'gemini-3.1-flash-lite'
): Promise<string> {
  try {
    if (!apiKey?.trim()) {
      throw new Error('API key is required');
    }

    if (actions.length === 0) {
      throw new Error('No actions provided for test case generation');
    }

    const genAI = new GoogleGenAI({ apiKey });

    const actionLog = formatActionsToText(actions);
    const prompt = `${SYSTEM_PROMPT}\n\nACTION LOG FROM RECORDING:\n${actionLog}\n\nINSTRUCTIONS:\n1. Analyze the screenshots provided to identify all UI elements and their exact text labels\n2. Create ONE single test case that represents the complete workflow shown in this session\n3. In each test step, reference the EXACT UI text for buttons, fields, menus, and messages\n4. Include visual verification points to confirm expected UI states\n5. Do NOT generate multiple test cases - generate only ONE consolidated test case`;

    // Build content parts array
    const contentParts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [
      {
        text: prompt,
      },
    ];

    // Add screenshots if provided
    const validScreenshots = screenshots.filter(b64 => b64?.trim());
    if (validScreenshots.length > 0) {
      validScreenshots.forEach((b64) => {
        contentParts.push({
          inlineData: {
            data: b64,
            mimeType: 'image/png',
          },
        });
      });
    }

    const result = await genAI.models.generateContent({
      model: modelName,
      contents: [
        {
          parts: contentParts,
        },
      ],
    });

    if (!result || !result.candidates || result.candidates.length === 0) {
      throw new Error('No response received from Gemini API');
    }

    const candidate = result.candidates[0];
    if (!candidate?.content?.parts || candidate.content.parts.length === 0) {
      throw new Error('Empty response received from Gemini API');
    }

    const text = candidate.content.parts[0].text;
    if (!text?.trim()) {
      throw new Error('Empty response received from Gemini API');
    }

    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Failed to generate test cases with Gemini: ${errorMessage}`, { cause: error });
  }
}
