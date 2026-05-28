import { BrowserWindow, app, desktopCapturer, dialog, ipcMain, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { uIOhook } from "uiohook-napi";
import screenshot from "screenshot-desktop";
import { v4 } from "uuid";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
//#region electron/pathValidator.ts
/**
* Path validation utility to prevent directory traversal and unauthorized file access
* All file operations should use these validators
*/
/**
* Gets the safe base directory for storing temporary files
*/
function getSafeTempDir() {
	return path.join(app.getPath("temp"), "testforge");
}
/**
* Gets the safe screenshots directory
*/
function getScreenshotsDir() {
	return path.join(getSafeTempDir(), "screenshots");
}
/**
* Validates and sanitizes a file path to prevent directory traversal attacks
* @param inputPath - The path to validate
* @param allowedBaseDir - The directory the path must be within
* @returns Validated absolute path, or null if invalid
*/
function validatePath(inputPath, allowedBaseDir) {
	if (!inputPath || typeof inputPath !== "string") return null;
	try {
		const resolvedPath = path.resolve(inputPath);
		const resolvedBase = path.resolve(allowedBaseDir);
		const normalizedPath = resolvedPath.replace(/\\/g, "/").toLowerCase();
		const normalizedBase = (resolvedBase.replace(/\\/g, "/") + "/").toLowerCase();
		if (!normalizedPath.startsWith(normalizedBase)) {
			console.warn(`Path traversal attempt detected: ${inputPath}`);
			return null;
		}
		if (path.relative(resolvedBase, resolvedPath).startsWith("..")) {
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
function validateTempPath(filePath) {
	return validatePath(filePath, getSafeTempDir());
}
/**
* Sanitizes a filename to remove potentially dangerous characters
* @param filename - The filename to sanitize
* @returns Sanitized filename
*/
function sanitizeFilename(filename) {
	return filename.replace(/[\x00-\x1f\x7f]/g, "").replace(/[<>:"|?*]/g, "_").replace(/\.\./g, "_").replace(/\/\\\\/g, "_").trim();
}
/**
* Ensures the safe temp directory exists
*/
function ensureSafeDirExists() {
	const tempDir = getSafeTempDir();
	const screenshotsDir = getScreenshotsDir();
	if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
	if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
}
//#endregion
//#region electron/screenshotCapture.ts
async function captureScreenshot() {
	try {
		const screenshotsDir = getScreenshotsDir();
		if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
		const filename = `screenshot_${Date.now()}_${v4()}.png`;
		const filePath = path.join(screenshotsDir, filename);
		await screenshot({ filename: filePath });
		return filePath;
	} catch (err) {
		console.error("Failed to capture screenshot:", err);
		return null;
	}
}
//#endregion
//#region electron/actionObserver.ts
var isObserving = false;
var mainWindow = null;
var lastScrollTime = 0;
var isGeneratorActive = false;
function setObserverWindow(win) {
	mainWindow = win;
}
function setGeneratorActive(active) {
	isGeneratorActive = active;
}
function sendAction(action) {
	if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("action-captured", action);
}
function startObserving() {
	if (isObserving) return;
	isObserving = true;
	uIOhook.on("click", async (e) => {
		if (e.button === 1 && !isGeneratorActive) {
			const screenshotPath = await captureScreenshot();
			sendAction({
				id: v4(),
				timestamp: Date.now(),
				type: "click",
				label: "Mouse Click",
				coordinates: {
					x: e.x,
					y: e.y
				},
				screenshotPath: screenshotPath || void 0
			});
		}
	});
	uIOhook.on("keydown", (e) => {
		if (!isGeneratorActive) sendAction({
			id: v4(),
			timestamp: Date.now(),
			type: "key_press",
			label: "Key Press",
			keyCombo: e.keycode.toString()
		});
	});
	uIOhook.on("wheel", (e) => {
		const now = Date.now();
		if (now - lastScrollTime > 3e3 && !isGeneratorActive) {
			lastScrollTime = now;
			sendAction({
				id: v4(),
				timestamp: Date.now(),
				type: "scroll",
				label: e.rotation > 0 ? "Scroll Down" : "Scroll Up"
			});
		}
	});
	try {
		uIOhook.start();
	} catch (err) {
		console.error("Failed to start uIOhook:", err);
	}
}
function stopObserving() {
	if (!isObserving) return;
	isObserving = false;
	try {
		uIOhook.stop();
	} catch (error) {
		console.warn("Failed to stop uIOhook", error);
	}
}
//#endregion
//#region electron/ipcChannels.ts
/**
* IPC Channel Definitions
* Defines all permitted IPC channels for secure communication between
* main process and renderer process. All IPC calls must use channels from this list.
*/
var IPC_CHANNELS = {
	"get-desktop-sources": "get-desktop-sources",
	"save-video": "save-video",
	"read-file-base64": "read-file-base64",
	"download-file": "download-file",
	"start-observing": "start-observing",
	"stop-observing": "stop-observing",
	"action-captured": "action-captured",
	"set-generator-active": "set-generator-active",
	"session-memory-clear": "session-memory-clear",
	"get-gemini-api-key": "get-gemini-api-key",
	"get-claude-api-key": "get-claude-api-key",
	"set-gemini-api-key": "set-gemini-api-key",
	"set-claude-api-key": "set-claude-api-key",
	"clear-api-keys": "clear-api-keys",
	"generate-test-cases": "generate-test-cases",
	"user-consent-screenshot": "user-consent-screenshot",
	"ipc-auto-test-result": "ipc-auto-test-result"
};
//#endregion
//#region electron/keyStore.ts
var keytar = null;
var keytarError = null;
async function ensureKeytar() {
	if (keytar) return keytar;
	if (keytarError) throw keytarError;
	try {
		keytar = await import("keytar").then((m) => m.default || m);
		return keytar;
	} catch (error) {
		console.warn("Failed to import keytar as ESM:", error);
		keytarError = error instanceof Error ? error : new Error(String(error));
		throw keytarError;
	}
}
var SERVICE_NAME = "TestForge";
var GEMINI_KEY_ACCOUNT = "gemini-api-key";
var CLAUDE_KEY_ACCOUNT = "claude-api-key";
/**
* Secure key storage using OS keychain
* - Windows: Credential Manager
* - macOS: Keychain
* - Linux: Secret Service
*/
async function setGeminiApiKey(apiKey) {
	if (!apiKey?.trim()) {
		await deleteGeminiApiKey();
		return;
	}
	try {
		await (await ensureKeytar()).setPassword(SERVICE_NAME, GEMINI_KEY_ACCOUNT, apiKey);
	} catch (error) {
		console.error("Failed to store Gemini API key:", error);
		throw error;
	}
}
async function getGeminiApiKey() {
	try {
		return await (await ensureKeytar()).getPassword(SERVICE_NAME, GEMINI_KEY_ACCOUNT);
	} catch (error) {
		console.error("Failed to retrieve Gemini API key:", error);
		return null;
	}
}
async function deleteGeminiApiKey() {
	try {
		await (await ensureKeytar()).deletePassword(SERVICE_NAME, GEMINI_KEY_ACCOUNT);
	} catch (error) {
		console.error("Failed to delete Gemini API key:", error);
	}
}
async function setClaudeApiKey(apiKey) {
	if (!apiKey?.trim()) {
		await deleteClaudeApiKey();
		return;
	}
	try {
		await (await ensureKeytar()).setPassword(SERVICE_NAME, CLAUDE_KEY_ACCOUNT, apiKey);
	} catch (error) {
		console.error("Failed to store Claude API key:", error);
		throw error;
	}
}
async function getClaudeApiKey() {
	try {
		return await (await ensureKeytar()).getPassword(SERVICE_NAME, CLAUDE_KEY_ACCOUNT);
	} catch (error) {
		console.error("Failed to retrieve Claude API key:", error);
		return null;
	}
}
async function deleteClaudeApiKey() {
	try {
		await (await ensureKeytar()).deletePassword(SERVICE_NAME, CLAUDE_KEY_ACCOUNT);
	} catch (error) {
		console.error("Failed to delete Claude API key:", error);
	}
}
async function clearAllApiKeys() {
	await Promise.all([deleteGeminiApiKey(), deleteClaudeApiKey()]);
}
//#endregion
//#region src/config/prompts/gemini/detailed.ts
/**
* Detailed Gemini Prompt - Comprehensive test case generation with extensive guidance
* Used in electron/geminiApiHandler.ts for main test case generation
* 
* Features:
* - 15KB comprehensive prompt with detailed examples
* - 20+ action type examples
* - State transitions and validation handling
* - Error recovery documentation
* - Precision-focused for complex workflows
*/
var GEMINI_DETAILED_PROMPT = `
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

Test Steps - RECORDING FLOW CAPTURE (HIGHEST ACCURACY):

STEP GENERATION RULES:

1. ACTION SEQUENCE MAPPING:
   - Map EVERY recorded action in EXACT chronological order (no gaps, no skips)
   - Each step = ONE recorded action (click, input, scroll, selection, navigation)
   - Include sequential step numbers without gaps: 1, 2, 3...
   - DO NOT include the final STOP button click

2. MANDATORY STEP STRUCTURE:
   N. [ACTION STATEMENT with EXACT UI TEXT]. Verify: [OUTCOME/RESULT]
   
   Where [ACTION_TYPE] is one of:
   - CLICK (for buttons, links, menu items)
   - INPUT (for text/number fields)
   - SELECT (for dropdowns, radio buttons)
   - CHECK (for checkboxes)
   - INTERACT (for modals, dialogs)
   - VIEW (for messages, errors, info banners, validation)
   - NAVIGATE (for page/tab changes)
   - SCROLL (if recorded and affects UI visibility)
   - DOUBLE_CLICK (for opening files, items)
   - RIGHT_CLICK (for context menus)
   - DRAG_DROP (for moving/reordering elements)
   - UPLOAD (for file uploads)
   - KEYBOARD (for keyboard shortcuts/key presses)
   - TOGGLE (for toggle switches)
   - RANGE (for sliders/range inputs)
   - DATE_PICK (for date/time pickers)
   - MULTI_SELECT (for selecting multiple items)
   - SEARCH (for search/filter interactions)
   - EXPAND (for expanding accordion/tree items)
   - COLLAPSE (for collapsing accordion/tree items)
   - SORT (for table/list sorting)
   - COPY (for clipboard copy actions)
   - PASTE (for clipboard paste actions)

3. UI ELEMENT TYPES - EXACT CAPTURE:

   BUTTONS:
   N. Click the "[Exact Button Text]" [location if needed]. Verify: [What happens immediately]
   Example: 1. Click the "Login" button (top-right corner). Verify: Login modal appears.

   TEXT/NUMBER INPUTS:
   N. Click the "[Field Label]" field and enter "[EXACT_VALUE]". Verify: [Field shows value/validation]
   Example: 2. Click the "Email" field and enter "user@example.com". Verify: Field is populated with the email address.

   DROPDOWNS/SELECTIONS:
   N. Click the "[Dropdown Label]" dropdown and select "[Exact Option Text]". Verify: [Dropdown closes and shows selection]
   Example: 3. Click the "Account Type" dropdown and select "Administrator". Verify: Selection displays in dropdown field.

   CHECKBOXES:
   N. Click the "[Label Text]" checkbox to [Check/Uncheck]. Verify: [Related UI updates if applicable]
   Example: 4. Click the "Remember me" checkbox to check it. Verify: Checkbox is marked with checkmark.

   DIALOGS/MODALS:
   N. Interact with the "[Dialog/Modal Title]" dialog. Verify: [Fields/buttons visible]
   Example: 5. Interact with the "Confirm Action" dialog. Verify: Dialog contains "Yes", "No", "Cancel" buttons.

   ERROR/INFO/WARNING MESSAGES:
   N. View the "[EXACT Message Text]" [message type: error/info/warning/success] message. Verify: [Visible location/state]
   Example: 6. View the "Invalid email format" error message. Verify: Red banner appears below the email field.

   LISTS/MENU SELECTIONS:
   N. Select "[Item Text]" from the "[List/Menu Name]" menu. Verify: [Item highlighted/selected]
   Example: 7. Select "Report Generator" from the "Tools" menu. Verify: Menu item is highlighted.

   PAGE/TAB NAVIGATION:
   N. Navigate to the "[Page/Tab Name]" page. Verify: [Page loads and displays content]
   Example: 8. Navigate to the "Dashboard" page. Verify: Dashboard loads and displays welcome message.

   DOUBLE_CLICK:
   N. Double-click on the "[Item/File Name]" item. Verify: [What opens/executes]
   Example: 9. Double-click on the "report.pdf" file. Verify: PDF opens in the viewer.

   RIGHT_CLICK (CONTEXT MENUS):
   N. Right-click on "[Element Text]" to open the context menu. Verify: [Options visible]
   Example: 10. Right-click on "Document Name" to open the context menu. Verify: Menu shows "Edit", "Delete", "Share" options.

   DRAG_DROP:
   N. Drag "[Source Element]" and drop it onto the "[Target Location]". Verify: [Element repositioned]
   Example: 11. Drag "Task Item #3" and drop it onto the "High Priority" column. Verify: Item is moved to the new column.

   UPLOAD:
   N. Click the "[Upload Field Label]" field and select the file "[file_name.ext]". Verify: [File uploaded/confirmation]
   Example: 12. Click the "Profile Picture" field and select the file "avatar.png". Verify: File is uploaded and preview displays.

   KEYBOARD:
   N. Press the keyboard shortcut "[Key Combination]". Verify: [Action triggered/result]
   Example: 13. Press the keyboard shortcut "Ctrl+S". Verify: File saves and success message appears.

   TOGGLE:
   N. Toggle the "[Toggle Label]" switch to [On/Off]. Verify: [State change and related UI updates]
   Example: 14. Toggle the "Dark Mode" switch to ON. Verify: Application background changes to dark theme.

   RANGE/SLIDER:
   N. Adjust the "[Slider Label]" slider to "[value/position]". Verify: [Value updates and UI reflects change]
   Example: 15. Adjust the "Volume" slider to "75%". Verify: Volume level displays as 75 and audio output changes.

   DATE/TIME PICKER:
   N. Click the "[Date Field Label]" field and select "[Date/Time]". Verify: [Field populated/calendar closes]
   Example: 16. Click the "Start Date" field and select "May 27, 2026". Verify: Field displays the selected date.

   MULTI_SELECT:
   N. Select "[Item 1]", "[Item 2]", "[Item 3]" from the "[List/Dropdown]" list. Verify: [All items selected]
   Example: 17. Select "Admin", "Editor", "Viewer" from the "User Roles" list. Verify: All three roles are highlighted with count showing "3 selected".

   SEARCH/FILTER:
   N. Click the "[Search Field Label]" field and enter "[search term]". Verify: [Results filtered/updated]
   Example: 18. Click the "Product Search" field and enter "laptop". Verify: Results display 12 matching products.

   EXPAND:
   N. Click to expand the "[Section/Item Name]" section. Verify: [Section expands and child items become visible]
   Example: 19. Click to expand the "Advanced Settings" section. Verify: Settings options expand below the section header.

   COLLAPSE:
   N. Click to collapse the "[Section/Item Name]" section. Verify: [Section collapses and child items are hidden]
   Example: 20. Click to collapse the "Advanced Settings" section. Verify: Settings options collapse and are no longer visible.

   SORT:
   N. Click the "[Column/Field Name]" column header to sort in [ascending/descending] order. Verify: [Data reorders accordingly]
   Example: 21. Click the "Date Created" column header to sort in descending order. Verify: List reorders with newest items displayed first.

4. STATE TRANSITIONS - BEFORE & AFTER:
   Each step must capture what changed as a result of the action:
   N. [ACTION STATEMENT with state details]. Verify: [State change from before to after]
   
   Example:
   5. Click the "Save" button (currently in enabled state). Verify: Button becomes disabled during processing, loading spinner appears, and success message "Record saved" displays.

5. EXACT USER INPUT VALUES:
   Capture every piece of user input data exactly as recorded:
   N. Click the "[Field Name]" field and enter "[EXACT_TEXT_USED]". Verify: [Field displays the value]
   
   Include: text, numbers, special characters, spaces, case sensitivity
   Example: 
   - 2. Click the "Username" field and enter "qa_automation_001". Verify: Field displays the username.
   - 3. Click the "Password" field and enter "Secure#Pass@123!". Verify: Field displays password characters securely.
   - 4. Click the "Search box" field and enter "test case". Verify: Search results update with matching items.

6. VALIDATION & ERROR HANDLING:
   Document validation messages and error recovery steps:
   N. View the "[Validation/Error Message Text]" message. Verify: [Where it appears and action user takes]
   N+1. [CORRECTIVE_ACTION STATEMENT]. Verify: [User corrects/retries/recovers]
   
   Example:
   - 7. View the "Username already exists" error message. Verify: Red error banner appears below the username field.
   - 8. Click the "Username" field and enter "qa_automation_002". Verify: Error message clears and field is updated.
   - 9. Click the "Submit" button. Verify: Form validates successfully and submission proceeds.

7. CONDITIONAL UI & VISIBILITY:
   If UI elements appear conditionally based on selections:
   N. [ACTION STATEMENT]. Verify: [Description of conditional UI appearance]
   
   Example:
   - 5. Click the "Enable Advanced Options" checkbox to check it. Verify: Advanced settings panel expands below the checkbox.

8. LOADING STATES & TRANSITIONS:
   If recording captures loading or page transitions:
   N. View the "[Loading indicator/spinner]" loading state. Verify: [Data loads/processing occurs]
   N+1. [NEXT_ACTION STATEMENT]. Verify: [New state after loading completes]
   
   Example:
   - 6. View the loading spinner on the page. Verify: Page data begins loading.
   - 7. Navigate to the "Results" tab. Verify: Results table loads and displays 25 records.

CRITICAL STEP ACCURACY REQUIREMENTS:
✓ Total steps = Total recorded actions (clicks + inputs + selections + state views)
✓ NO steps merged or combined
✓ NO steps skipped or omitted
✓ Steps in EXACT chronological order
✓ Each step includes EXACT UI text verbatim from screenshots
✓ Each step captures state changes (what's different after the action)
✓ Specific data values (emails, usernames, text) captured exactly
✓ All visible messages captured with exact text and type (error/info/warning/success)
✓ Error handling and recovery documented completely
✓ Exception: STOP button click excluded

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
✓ Each step has CLEAR intended result or outcome implied by the action
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
□ Every step has EXACT text and a clear expected result or outcome
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
//#endregion
//#region src/config/prompts/gemini/simple.ts
/**
* Simple Gemini Prompt - Lightweight test case generation focused on UI text extraction
* Used in src/services/geminiService.ts for browser-based test case generation
* 
* Features:
* - 2.5KB lightweight prompt
* - UI text emphasis without extensive examples
* - Single test case requirement clearly stated
* - Suitable for browser/renderer process
*/
var GEMINI_SIMPLE_PROMPT = `
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
//#endregion
//#region src/config/prompts/claude/standard.ts
/**
* Claude Standard Prompt - Consistent test case generation instructions
* Used in both electron/claudeApiHandler.ts and src/services/claudeService.ts
* 
* Features:
* - Lightweight, consistent prompt (~280 chars)
* - Same prompt for both electron and browser implementations
* - Focuses on structured test case format
*/
var CLAUDE_STANDARD_PROMPT = `
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
//#endregion
//#region electron/geminiApiHandler.ts
/**
* Formats action events into a readable text log
*/
function formatActionsToText$1(actions) {
	return actions.map((a) => `[${new Date(a.timestamp).toISOString()}] [${a.type.toUpperCase()}] — ${a.label} | Coords: ${a.coordinates ? `${a.coordinates.x},${a.coordinates.y}` : "N/A"}`).join("\n");
}
/**
* Logs Gemini API interactions (input/output) for debugging and auditing
*/
function logGeminiInteraction(type, data) {
	const timestamp = (/* @__PURE__ */ new Date()).toISOString();
	const logEntry = {
		timestamp,
		interactionType: type,
		...data
	};
	console.log("\n" + "=".repeat(80));
	console.log(`GEMINI API ${type.toUpperCase()} [${timestamp}]`);
	console.log("=".repeat(80));
	console.log(JSON.stringify(logEntry, null, 2));
	console.log("=".repeat(80) + "\n");
}
/**
* Generates test cases using Google's Gemini API (called from main process)
* @param actions - Array of recorded user actions
* @param screenshots - Array of base64-encoded screenshot strings
* @param modelName - Model to use (default: gemini-2.5-flash)
* @param promptMode - Prompt variant to use: 'detailed' for comprehensive, 'simple' for lightweight (default: 'detailed')
* @returns Promise resolving to generated test cases as string
*/
async function generateTestCasesWithGemini(actions, screenshots, modelName = "gemini-2.5-flash", promptMode = "detailed") {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey?.trim()) throw new Error("Gemini API key not found. Please configure it in Settings.");
		if (actions.length === 0) throw new Error("No actions provided for test case generation");
		const selectedPrompt = promptMode === "simple" ? GEMINI_SIMPLE_PROMPT : GEMINI_DETAILED_PROMPT;
		const genAI = new GoogleGenAI({ apiKey });
		const prompt = `${selectedPrompt}\n\nACTION LOG FROM RECORDING:\n${formatActionsToText$1(actions)}\n\nINSTRUCTIONS:\n1. Analyze the screenshots provided to identify all UI elements and their exact text labels\n2. Create ONE single test case that represents the complete workflow shown in this session\n3. In each test step, reference the EXACT UI text for buttons, fields, menus, and messages\n4. Do NOT include per-step 'Expected' or 'Visual Check' lines; provide a concise Expected summary at the end of the test case instead\n5. Do NOT generate multiple test cases - generate only ONE consolidated test case`;
		const contentParts = [{ text: prompt }];
		const validScreenshots = screenshots.filter((b64) => b64?.trim());
		if (validScreenshots.length > 0) validScreenshots.forEach((b64) => {
			contentParts.push({ inlineData: {
				data: b64,
				mimeType: "image/png"
			} });
		});
		logGeminiInteraction("input", {
			model: modelName,
			actionsCount: actions.length,
			screenshotsCount: validScreenshots.length,
			prompt: prompt.substring(0, 500) + (prompt.length > 500 ? "...(truncated)" : "")
		});
		const result = await genAI.models.generateContent({
			model: modelName,
			contents: [{ parts: contentParts }]
		});
		if (!result || !result.candidates || result.candidates.length === 0) throw new Error("No response received from Gemini API");
		const candidate = result.candidates[0];
		if (!candidate?.content?.parts || candidate.content.parts.length === 0) throw new Error("Empty response received from Gemini API");
		const text = candidate.content.parts[0].text;
		if (!text?.trim()) throw new Error("Empty response received from Gemini API");
		logGeminiInteraction("output", {
			model: modelName,
			response: text.substring(0, 500) + (text.length > 500 ? "...(truncated)" : "")
		});
		return text;
	} catch (error) {
		logGeminiInteraction("output", { error: error instanceof Error ? error.message : "Unknown error occurred" });
		if (error instanceof Error) throw new Error(`Failed to generate test cases with Gemini: ${error.message}`, { cause: error });
		throw new Error("Failed to generate test cases with Gemini: Unknown error occurred", { cause: error });
	}
}
//#endregion
//#region electron/claudeApiHandler.ts
var SYSTEM_PROMPT = CLAUDE_STANDARD_PROMPT;
var MAX_TOKENS = 4096;
/**
* Formats action events into a readable text log
*/
function formatActionsToText(actions) {
	return actions.map((a) => `[${new Date(a.timestamp).toISOString()}] [${a.type.toUpperCase()}] — ${a.label} | Coords: ${a.coordinates ? `${a.coordinates.x},${a.coordinates.y}` : "N/A"}`).join("\n");
}
/**
* Generates test cases using Claude API (called from main process)
* @param actions - Array of recorded user actions
* @param screenshots - Array of base64-encoded screenshot strings
* @param modelName - Model to use (default: claude-3-5-sonnet-20241022)
* @returns Promise resolving to generated test cases as string
*/
async function generateTestCasesWithClaude(actions, screenshots, modelName = "claude-3-5-sonnet-20241022") {
	try {
		const apiKey = await getClaudeApiKey();
		if (!apiKey?.trim()) throw new Error("Claude API key not found. Please configure it in Settings.");
		if (actions.length === 0) throw new Error("No actions provided for test case generation");
		const client = new Anthropic({ apiKey });
		const imageContent = screenshots.filter((b64) => b64?.trim()).map((b64) => ({
			type: "image",
			source: {
				type: "base64",
				media_type: "image/png",
				data: b64
			}
		}));
		const userPrompt = `ACTION LOG:\n${formatActionsToText(actions)}\n\nGenerate complete test cases based on this session.`;
		const textBlock = (await client.messages.create({
			model: modelName,
			max_tokens: MAX_TOKENS,
			system: SYSTEM_PROMPT,
			messages: [{
				role: "user",
				content: [...imageContent, {
					type: "text",
					text: userPrompt
				}]
			}]
		})).content.find((b) => b.type === "text");
		if (!textBlock || textBlock.type !== "text") throw new Error("No text response received from Claude API");
		return textBlock.text || "";
	} catch (error) {
		if (error instanceof Error) throw new Error(`Failed to generate test cases with Claude: ${error.message}`, { cause: error });
		throw error;
	}
}
//#endregion
//#region electron/ipcHandlers.ts
function setupIpcHandlers(win) {
	try {
		setObserverWindow(win);
		ensureSafeDirExists();
	} catch (error) {
		console.error("Error during IPC setup initialization:", error);
	}
	try {
		ipcMain.handle(IPC_CHANNELS["get-desktop-sources"], async () => {
			return (await desktopCapturer.getSources({
				types: ["window", "screen"],
				thumbnailSize: {
					width: 400,
					height: 400
				}
			})).map((source) => ({
				id: source.id,
				name: source.name,
				thumbnail: source.thumbnail.toDataURL()
			}));
		});
	} catch (error) {
		console.error("Error registering get-desktop-sources handler:", error);
	}
	ipcMain.handle(IPC_CHANNELS["save-video"], async (_, buffer) => {
		try {
			const tempDir = getSafeTempDir();
			const filename = sanitizeFilename(`recording_${Date.now()}.webm`);
			const validatedPath = validateTempPath(path.join(tempDir, filename));
			if (!validatedPath) throw new Error("Invalid video path - validation failed");
			console.log(`Saving video to: ${validatedPath}, buffer size: ${buffer.length} bytes`);
			fs.writeFileSync(validatedPath, buffer);
			if (!fs.existsSync(validatedPath)) throw new Error("Video file was not created");
			const stats = fs.statSync(validatedPath);
			console.log(`Video saved successfully: ${validatedPath}, file size: ${stats.size} bytes`);
			return validatedPath;
		} catch (error) {
			console.error("Error saving video:", error);
			if (error instanceof Error) throw new Error(`Failed to save video: ${error.message}`, { cause: error });
			throw new Error("Failed to save video: Unknown error occurred", { cause: error });
		}
	});
	ipcMain.on(IPC_CHANNELS["start-observing"], () => {
		startObserving();
	});
	ipcMain.on(IPC_CHANNELS["stop-observing"], () => {
		stopObserving();
	});
	ipcMain.on(IPC_CHANNELS["set-generator-active"], (_, active) => {
		setGeneratorActive(active);
	});
	ipcMain.on(IPC_CHANNELS["session-memory-clear"], () => {
		console.log("Session memory clear event received from renderer");
	});
	ipcMain.handle(IPC_CHANNELS["read-file-base64"], (_, filePath) => {
		try {
			const validatedPath = validateTempPath(filePath);
			if (!validatedPath) {
				console.warn(`Path validation failed for file: ${filePath}`);
				return "";
			}
			if (!fs.existsSync(validatedPath)) {
				console.warn(`File does not exist: ${validatedPath}`);
				return "";
			}
			const buffer = fs.readFileSync(validatedPath);
			if (buffer.length === 0) {
				console.warn(`File is empty: ${validatedPath}`);
				return "";
			}
			const base64 = buffer.toString("base64");
			console.log(`Successfully read file: ${validatedPath}, size: ${buffer.length} bytes, base64 length: ${base64.length}`);
			return base64;
		} catch (error) {
			console.error("Error reading file:", error);
			return "";
		}
	});
	ipcMain.handle(IPC_CHANNELS["download-file"], async (event, sourcePath) => {
		try {
			if (!sourcePath) throw new Error("No video path provided");
			const validatedSourcePath = validateTempPath(sourcePath);
			if (!validatedSourcePath || !fs.existsSync(validatedSourcePath)) {
				console.warn(`Unauthorized download attempt: ${sourcePath}`);
				throw new Error("Video file not found or access denied");
			}
			const windowContext = BrowserWindow.fromWebContents(event.sender);
			if (!windowContext) throw new Error("Window context not found");
			const { canceled, filePath } = await dialog.showSaveDialog(windowContext, {
				defaultPath: `recording_${Date.now()}.webm`,
				filters: [{
					name: "Videos",
					extensions: ["webm"]
				}]
			});
			if (!canceled && filePath) {
				fs.copyFileSync(validatedSourcePath, filePath);
				return {
					success: true,
					message: `Video saved to ${filePath}`
				};
			} else return {
				success: false,
				message: "Save canceled"
			};
		} catch (error) {
			console.error("Download file error:", error);
			if (error instanceof Error) throw new Error(`Failed to save video: ${error.message}`, { cause: error });
			throw new Error("Failed to save video: Unknown error occurred", { cause: error });
		}
	});
	ipcMain.handle(IPC_CHANNELS["get-gemini-api-key"], async () => {
		try {
			return await getGeminiApiKey() ? true : false;
		} catch (error) {
			console.error("Error retrieving Gemini API key:", error);
			return false;
		}
	});
	ipcMain.handle(IPC_CHANNELS["get-claude-api-key"], async () => {
		try {
			return await getClaudeApiKey() ? true : false;
		} catch (error) {
			console.error("Error retrieving Claude API key:", error);
			return false;
		}
	});
	ipcMain.handle(IPC_CHANNELS["set-gemini-api-key"], async (_, apiKey) => {
		try {
			await setGeminiApiKey(apiKey);
			return {
				success: true,
				message: "Gemini API key saved securely"
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
			console.error("Error saving Gemini API key:", error);
			return {
				success: false,
				message: errorMessage
			};
		}
	});
	ipcMain.handle(IPC_CHANNELS["set-claude-api-key"], async (_, apiKey) => {
		try {
			await setClaudeApiKey(apiKey);
			return {
				success: true,
				message: "Claude API key saved securely"
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
			console.error("Error saving Claude API key:", error);
			return {
				success: false,
				message: errorMessage
			};
		}
	});
	ipcMain.handle(IPC_CHANNELS["clear-api-keys"], async () => {
		try {
			await clearAllApiKeys();
			return {
				success: true,
				message: "API keys cleared"
			};
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
			console.error("Error clearing API keys:", error);
			return {
				success: false,
				message: errorMessage
			};
		}
	});
	ipcMain.handle(IPC_CHANNELS["generate-test-cases"], async (_, actionData) => {
		const { actions, screenshots, modelName, promptMode = "detailed" } = actionData;
		try {
			if (modelName && modelName.includes("gemini")) return await generateTestCasesWithGemini(actions, screenshots, modelName, promptMode);
			else return await generateTestCasesWithClaude(actions, screenshots, modelName);
		} catch (error) {
			console.error("Error generating test cases:", error);
			throw error;
		}
	});
	try {
		ipcMain.on(IPC_CHANNELS["ipc-auto-test-result"], (event, result) => {
			console.log("ipc-auto-test-result received from renderer:", result);
			try {
				const obj = result;
				if (obj.status === "success") {
					console.log("Automated IPC test reported success — exiting app with code 0");
					setTimeout(() => app.exit(0), 200);
				} else {
					console.error("Automated IPC test reported failure:", obj.message || obj);
					setTimeout(() => app.exit(2), 200);
				}
			} catch (err) {
				console.error("Error handling ipc-auto-test-result payload:", err);
				setTimeout(() => app.exit(3), 200);
			}
		});
	} catch (err) {
		console.error("Failed to register ipc-auto-test-result handler:", err);
	}
}
//#endregion
//#region electron/iconHelper.ts
function getAppIcon() {
	const dataUrl = `data:image/svg+xml;base64,${Buffer.from(`
    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#4f46e5;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#16a34a;stop-opacity:1" />
        </linearGradient>
      </defs>
      <rect width="200" height="200" rx="50" fill="url(#bgGradient)"/>
      <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="80" font-weight="800" letter-spacing="-4" fill="#FFFFFF">TF</text>
    </svg>
  `).toString("base64")}`;
	try {
		return nativeImage.createFromDataURL(dataUrl);
	} catch (error) {
		console.error("Failed to create icon:", error);
		return;
	}
}
//#endregion
//#region electron/main.ts
var APP_ROOT = process.cwd();
process.env.APP_ROOT = APP_ROOT;
var __dirname = path.join(APP_ROOT, "dist-electron");
var VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
var MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
var RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
var userDataPath = process.env.NODE_ENV === "production" ? path.resolve(process.env.APP_ROOT, ".app-data") : path.join(os.tmpdir(), "TestForge-electron");
app.setPath("userData", userDataPath);
var cachePath = path.join(userDataPath, "cache");
var logsPath = path.join(userDataPath, "logs");
var gpuCachePath = path.join(userDataPath, "GPUCache");
fs.mkdirSync(cachePath, { recursive: true });
fs.mkdirSync(logsPath, { recursive: true });
fs.mkdirSync(gpuCachePath, { recursive: true });
app.commandLine.appendSwitch("disk-cache-dir", cachePath);
app.commandLine.appendSwitch("gpu-cache-dir", gpuCachePath);
app.commandLine.appendSwitch("disable-application-cache");
app.commandLine.appendSwitch("disable-cache");
app.commandLine.appendSwitch("disk-cache-size", "0");
app.commandLine.appendSwitch("media-cache-size", "0");
app.commandLine.appendSwitch("disable-gpu-cache");
app.setPath("cache", cachePath);
app.setPath("logs", logsPath);
console.log("Electron data paths:", {
	userData: userDataPath,
	cache: cachePath,
	logs: logsPath,
	gpuCache: gpuCachePath
});
var win;
function onWebContentsCrashed(webContents, listener) {
	webContents.on("crashed", listener);
}
function onAppWindowAllClosedBeforeQuit(appInstance, listener) {
	appInstance.on("window-all-closed-before-quit", listener);
}
function createWindow() {
	const preloadPath = path.join(__dirname, "preload.js");
	console.log("Creating window with preload:", preloadPath);
	console.log("Preload exists:", fs.existsSync(preloadPath));
	const appIcon = getAppIcon();
	try {
		win = new BrowserWindow({
			icon: appIcon,
			width: 1200,
			height: 800,
			webPreferences: {
				preload: preloadPath,
				contextIsolation: true,
				nodeIntegration: false,
				sandbox: true
			}
		});
	} catch (error) {
		console.error("Error creating BrowserWindow:", error);
		throw error;
	}
	if (!win) {
		console.error("Failed to create window - win is null");
		return;
	}
	win.setTitle("TF");
	try {
		win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
			callback({ responseHeaders: {
				...details.responseHeaders,
				"Content-Security-Policy": [
					"default-src 'self'",
					"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
					"style-src 'self' 'unsafe-inline'",
					"img-src 'self' data: blob:",
					"media-src 'self' blob:",
					"font-src 'self' data:",
					"connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com",
					"frame-ancestors 'none'",
					"base-uri 'self'",
					"form-action 'self'"
				].join("; ")
			} });
		});
	} catch (error) {
		console.error("Error setting CSP headers:", error);
	}
	if (VITE_DEV_SERVER_URL) {
		console.log("Loading dev server:", VITE_DEV_SERVER_URL);
		win.loadURL(VITE_DEV_SERVER_URL).catch((error) => {
			console.error("Error loading URL:", error);
		});
	} else {
		console.log("Loading from file:", path.join(RENDERER_DIST, "index.html"));
		win.loadFile(path.join(RENDERER_DIST, "index.html")).catch((error) => {
			console.error("Error loading file:", error);
		});
	}
	win.webContents.on("preload-error", (event, preloadPath, error) => {
		console.error("Preload error:", preloadPath, error);
	});
	win.webContents.on("render-process-gone", (event, details) => {
		console.error("Render process gone:", details);
	});
	onWebContentsCrashed(win.webContents, () => {
		console.error("Renderer process crashed");
	});
}
function cleanupTempFiles() {
	try {
		const tempDir = getSafeTempDir();
		const screenshotsDir = getScreenshotsDir();
		if (fs.existsSync(screenshotsDir)) {
			fs.readdirSync(screenshotsDir).forEach((file) => {
				try {
					fs.unlinkSync(path.join(screenshotsDir, file));
				} catch (error) {
					console.warn("Failed to delete screenshot:", file, error);
				}
			});
			try {
				fs.rmdirSync(screenshotsDir);
			} catch (error) {
				console.warn("Failed to remove screenshots directory", error);
			}
		}
		fs.readdirSync(tempDir).forEach((file) => {
			if (file.startsWith("recording_") && file.endsWith(".webm")) try {
				fs.unlinkSync(path.join(tempDir, file));
			} catch (error) {
				console.warn("Failed to delete video file:", file, error);
			}
		});
		console.log("Temporary files cleaned up successfully");
	} catch (error) {
		console.error("Error during cleanup:", error);
	}
}
/**
* Handles app closure and cleanup
* 
* Cleanup sequence:
* 1. Renderer process clears sessionStorage via sessionMemoryUtils
* 2. Main process receives 'session-memory-clear' IPC event
* 3. Temp files are deleted (videos, screenshots)
* 4. Session memory (Zustand store) automatically clears as it's in-memory only
* 5. App quits
*/
app.on("window-all-closed", () => {
	if (process.env.NODE_ENV === "production" && process.platform !== "darwin") {
		cleanupTempFiles();
		app.quit();
		win = null;
	} else if (process.platform === "darwin") console.log("All windows closed, app remains running (macOS)");
	else console.log("All windows closed, app remains running (development mode)");
});
onAppWindowAllClosedBeforeQuit(app, () => {
	try {
		cleanupTempFiles();
	} catch (error) {
		console.error("Error during cleanup:", error);
	}
});
app.on("before-quit", () => {
	console.log("App is about to quit, performing cleanup...");
	try {
		cleanupTempFiles();
	} catch (error) {
		console.error("Error during cleanup:", error);
	}
});
app.on("quit", () => {
	console.log("App has quit");
	win = null;
});
process.on("uncaughtException", (error) => {
	console.error("Uncaught exception in main process:", error);
});
app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.whenReady().then(() => {
	try {
		createWindow();
		if (win) setupIpcHandlers(win);
	} catch (error) {
		console.error("Error during app initialization:", error);
		if (error instanceof Error) console.error("Stack:", error.stack);
	}
});
//#endregion
export { MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL };
