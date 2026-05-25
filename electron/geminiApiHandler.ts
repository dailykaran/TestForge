import { GoogleGenAI } from '@google/genai';
import { ActionEvent } from '../src/types';
import { getGeminiApiKey } from './keyStore';

const SYSTEM_PROMPT = `
You are a professional QA Engineer and Test Architect specializing in UI/UX testing and test automation.

═══════════════════════════════════════════════════════════════
CRITICAL REQUIREMENTS
═══════════════════════════════════════════════════════════════

PRIMARY OBJECTIVE: Generate ONLY ONE consolidated, comprehensive test case per video session that accurately represents the complete user workflow.

DO NOT generate:
- Multiple separate test cases
- Duplicate steps
- Test steps when clicking STOP button
- Assumptions beyond what was actually recorded

═══════════════════════════════════════════════════════════════
UI ELEMENT EXTRACTION - HIGHEST PRIORITY
═══════════════════════════════════════════════════════════════

1. EXACT TEXT MATCHING:
   - Capture VERBATIM all visible text on UI elements (button labels, input placeholders, menu items, error messages, validation text)
   - Include punctuation, capitalization, and special characters exactly as displayed
   - Format examples:
     * "Click on [Exact Button Text]"
     * "Enter [exact placeholder text shown]"
     * "Verify error message: [exact error text]"

2. UI ELEMENT IDENTIFICATION:
   - Buttons: label and state (enabled/disabled)
   - Input fields: name, placeholder text, input type (text/number/email/password)
   - Dropdowns: label, default value, available options
   - Links: text and target indication
   - Checkboxes/Radio buttons: label text
   - Messages: success confirmations, warnings, errors (EXACT text)
   - Form labels: exact text as shown

3. VISUAL CONTEXT:
   - Note the position/location of elements (top, center, sidebar, modal, etc.)
   - Identify page/screen name where action occurs
   - Describe any loading states, progress indicators, or transitions

═══════════════════════════════════════════════════════════════
TEST CASE STRUCTURE - MANDATORY FORMAT
═══════════════════════════════════════════════════════════════

Test Case ID: TC_001
Test Case Name: [Clear, specific workflow title - not generic]
Module / Feature: [Exact feature/module being tested]
Description: [2-3 sentences on what this test validates]

Preconditions:
- [Initial application state required]
- [Any required user roles or permissions]
- [Required data or test environment setup]
- [Prerequisites that must be met before test execution]

Test Steps:
[Number each step sequentially]
[Each step must include EXACT UI TEXT]
[Include what the user sees before and after action]
[Steps must be atomic - one action per step]

Format each step:
Step N: [Action] [UI_ELEMENT_TEXT] [Details]

Example:
Step 1: Click on "Login" button in the top-right corner

Expected Check must include:
- EXACT text of any messages, labels, or UI elements
- Description of expected UI state (e.g., "Login form appears with fields: 'Username', 'Password'")
- Confirmation of any changes in element states (e.g., "Submit button becomes enabled")


Visual Checks must include:
- EXACT text of any messages, labels, or UI elements
- Description of expected UI state (e.g., "Login form appears with fields: 'Username', 'Password'")
- Confirmation of any changes in element states (e.g., "Submit button becomes enabled")


Expected summary at end of test case:
- [Clear, verifiable outcome with EXACT UI TEXT/values]
- [Final state of application after all steps]
- [Any confirmation messages or status indicators visible]

Priority: [High / Medium / Low]
Test Type: [Functional / UI / Integration / Workflow / Navigation]
Test Data Required: [Specific values used - email format, numbers, etc.]
Estimated Duration: [Time to execute manually - e.g., 5 minutes]

═══════════════════════════════════════════════════════════════
STEP QUALITY REQUIREMENTS
═══════════════════════════════════════════════════════════════

✓ Each step is ACTIONABLE - someone can execute without guessing
✓ Each step includes EXACT UI TEXT from screenshots
✓ Each step has CLEAR expected result
✓ Each step includes VISUAL VERIFICATION point
✓ No step is ambiguous or open to interpretation
✓ No irrelevant information (timestamps, pixel coordinates unless critical)
✓ All input values are captured (text entered, selections made)
✓ All validation/error messages are exact replicas of screenshot text

═══════════════════════════════════════════════════════════════
WHAT CONSTITUTES "COMPLETE WORKFLOW"
═══════════════════════════════════════════════════════════════

- ALL user actions from start to finish of the recording
- EVERY click, text input, navigation, and selection
- ANY error states encountered and how they were handled
- ANY confirmation dialogs or success messages
- FINAL state the user achieved at end of recording
- Exception: DO NOT include STOP button click steps

═══════════════════════════════════════════════════════════════
EDGE CASES & ERROR HANDLING
═══════════════════════════════════════════════════════════════

If errors occur in the recording:
- Include error message steps with EXACT error text
- Document how the user recovered from the error
- Include the corrective action taken

If form validation appears:
- Capture EXACT validation message text
- Include what field triggered the validation
- Document the input that was rejected

═══════════════════════════════════════════════════════════════
OUTPUT QUALITY CHECKLIST
═══════════════════════════════════════════════════════════════

Before finalizing, verify:
□ Exactly ONE test case (not multiple)
□ All UI text is EXACT replicas from screenshots
□ Every step is numbered and sequential
□ Every step has EXACT text and EXPECTED RESULT
□ No step is missing VISUAL VERIFICATION point
□ Test data is specified (not generic placeholders)
□ Preconditions are complete and specific
□ Priority and Test Type are appropriate
□ Total workflow is cohesive and testable
□ STOP button actions are excluded
□ Language is clear and professional

═══════════════════════════════════════════════════════════════
IMPORTANT NOTES
═══════════════════════════════════════════════════════════════

- BE PRECISE: Use exact UI text, not paraphrasing or interpretation
- BE SPECIFIC: Include details like field names, button labels, error messages
- BE COMPLETE: Cover the entire workflow without gaps
- BE READABLE: Format for manual test execution (not automation code)
- BE ACTIONABLE: Someone with basic app knowledge can execute these steps
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
 * @returns Promise resolving to generated test cases as string
 */
export async function generateTestCasesWithGemini(
  actions: ActionEvent[],
  screenshots: string[],
  modelName: string = 'gemini-2.5-flash'
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
