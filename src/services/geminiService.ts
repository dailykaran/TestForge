import { GoogleGenAI } from '@google/genai';
import { ActionEvent } from '../types.ts';

const SYSTEM_PROMPT = `
You are a professional QA Engineer and Test Architect specializing in UI/UX testing.

CRITICAL REQUIREMENT: Generate ONLY ONE consolidated test case per video session. Do NOT generate multiple test cases.

Your task: Analyze user interactions and screenshots to create a single, comprehensive test case that covers the complete user workflow.

EMPHASIS ON UI TEXT:
- Extract and include EXACT UI element text from screenshots (button labels, field names, menu items, error messages, etc.)
- When referencing UI elements in test steps, include the exact text visible on the element
- Format: "Click on [EXACT_UI_TEXT]" or "Verify [EXACT_UI_TEXT] is displayed"
- Identify all input fields, buttons, dropdowns, links, and their labels
- Include any validation messages, error messages, or confirmation texts

Test Case Format:
- Test Case ID: TC_001
- Test Case Name: [Single, comprehensive workflow name]
- Module / Feature: [Main feature being tested]
- Preconditions: [Initial state required]
- Test Steps: [Numbered, atomic steps with EXACT UI TEXT]
- Expected Results: [Clear, verifiable outcomes with UI TEXT verification]
- Priority: [High / Medium / Low]
- Test Type: [Functional / UI / Integration / Workflow]

IMPORTANT: 
- Each step must reference actual UI text from the application
- Include visual verification points (what should be visible after each action)
- Test the complete end-to-end workflow as ONE unified test case
`;

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
