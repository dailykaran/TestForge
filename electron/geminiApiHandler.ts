import { GoogleGenAI } from '@google/genai';
import { ActionEvent } from '../src/types';
import { getGeminiApiKey } from './keyStore';
import { gemini } from '../src/config/prompts';

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
 * Logs Gemini API interactions (input/output) for debugging and auditing
 */
function logGeminiInteraction(
  type: 'input' | 'output',
  data: {
    model?: string;
    actionsCount?: number;
    screenshotsCount?: number;
    prompt?: string;
    response?: string;
    timestamp?: string;
    error?: string;
  }
): void {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    interactionType: type,
    ...data,
  };

  console.log('\n' + '='.repeat(80));
  console.log(`GEMINI API ${type.toUpperCase()} [${timestamp}]`);
  console.log('='.repeat(80));
  console.log(JSON.stringify(logEntry, null, 2));
  console.log('='.repeat(80) + '\n');
}

/**
 * Generates test cases using Google's Gemini API (called from main process)
 * @param actions - Array of recorded user actions
 * @param screenshots - Array of base64-encoded screenshot strings
 * @param modelName - Model to use (default: gemini-2.5-flash)
 * @param promptMode - Prompt variant to use: 'detailed' for comprehensive, 'simple' for lightweight (default: 'detailed')
 * @returns Promise resolving to generated test cases as string
 */
export async function generateTestCasesWithGemini(
  actions: ActionEvent[],
  screenshots: string[],
  modelName: string = 'gemini-2.5-flash',
  promptMode: 'detailed' | 'simple' = 'detailed'
): Promise<string> {
  try {
    // Get API key securely from OS keychain
    const apiKey = await getGeminiApiKey();
    if (!apiKey?.trim()) {
      throw new Error('Gemini API key not found. Please configure it in Settings.');
    }

    if (actions.length === 0) {
      throw new Error('No actions provided for test case generation');
    }

    // Select prompt based on mode
    const selectedPrompt = promptMode === 'simple' ? gemini.GEMINI_SIMPLE_PROMPT : gemini.GEMINI_DETAILED_PROMPT;

    const genAI = new GoogleGenAI({ apiKey });

    const actionLog = formatActionsToText(actions);
    const prompt = `${selectedPrompt}\n\nACTION LOG FROM RECORDING:\n${actionLog}\n\nINSTRUCTIONS:\n1. Analyze the screenshots provided to identify all UI elements and their exact text labels\n2. Create ONE single test case that represents the complete workflow shown in this session\n3. In each test step, reference the EXACT UI text for buttons, fields, menus, and messages\n4. Do NOT include per-step 'Expected' or 'Visual Check' lines; provide a concise Expected summary at the end of the test case instead\n5. Do NOT generate multiple test cases - generate only ONE consolidated test case`;

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

    // Log the prompt input
    logGeminiInteraction('input', {
      model: modelName,
      actionsCount: actions.length,
      screenshotsCount: validScreenshots.length,
      prompt: prompt.substring(0, 500) + (prompt.length > 500 ? '...(truncated)' : ''),
    });

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

    // Log the API response output
    logGeminiInteraction('output', {
      model: modelName,
      response: text.substring(0, 500) + (text.length > 500 ? '...(truncated)' : ''),
    });

    return text;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    
    // Log the error
    logGeminiInteraction('output', {
      error: errorMessage,
    });

    if (error instanceof Error) {
      throw new Error(`Failed to generate test cases with Gemini: ${error.message}`, { cause: error });
    }
    throw new Error('Failed to generate test cases with Gemini: Unknown error occurred', { cause: error });
  }
}
