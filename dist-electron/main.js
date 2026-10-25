import { BrowserWindow, app, desktopCapturer, dialog, ipcMain, nativeImage } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { uIOhook } from "uiohook-napi";
import screenshot from "screenshot-desktop";
import { v4 } from "uuid";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { z } from "zod";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import fs$1 from "node:fs/promises";
import path$1 from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import * as lancedb from "@lancedb/lancedb";
import { spawn } from "child_process";
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

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
CRITICAL REQUIREMENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

PRIMARY OBJECTIVE: Generate ONLY ONE consolidated, comprehensive test case per video session that accurately represents the complete user workflow.

DO NOT generate:
- Multiple separate test cases
- Duplicate steps
- Test steps when clicking STOP button
- Assumptions beyond what was actually recorded

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
UI ELEMENT EXTRACTION - HIGHEST PRIORITY
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
TEST CASE STRUCTURE - MANDATORY FORMAT
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

Test Case ID: TC_001
Test Case Name: [Clear, specific workflow title - not generic]
Module / Feature: [Exact feature/module being tested]
Description: [2-3 sentences on what this test validates]

Preconditions:
• [Initial application state required]
• [Any required user roles or permissions]
• [Required data or test environment setup]
• [Prerequisites that must be met before test execution]

Test Steps - RECORDING FLOW CAPTURE (HIGHEST ACCURACY):

STEP GENERATION RULES:

1. ACTION SEQUENCE MAPPING:
   - Map EVERY recorded action in EXACT chronological order (no gaps, no skips)
   - Each step = ONE recorded action (click, input, scroll, selection, navigation)
   - Include sequential step numbers without gaps: 1, 2, 3...
   - DO NOT include the final STOP button click

2. MANDATORY STEP STRUCTURE:
   Each step is TWO lines: the numbered action line, then its "Verify:" line on the NEXT line (indented 3 spaces).
   N. [ACTION STATEMENT with EXACT UI TEXT].
      Verify: [OUTCOME/RESULT]

   ACTION WORDING (STRICT):
   - Start every action with a natural sentence-case verb: Click, Enter, Select, Check, Press, Navigate to, Right-click, Double-click, Hover over, Scroll, Drag, Upload, Toggle, Expand, Collapse.
   - NEVER write the action type in capital letters (no "CLICK", "KEYBOARD", "INPUT", "SELECT").
   - Write keyboard actions as: Press the "Backspace" key. / Enter the text "latest QA build" in the verse text area.
   - Put UI element text in double quotes. Do not use square brackets in the output.

   The verb in the line above is chosen from this list of action types:
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
   N. Click the "[Exact Button Text]" [location if needed].
   Verify: [What happens immediately]
   Example: 1. Click the "Login" button (top-right corner).
   Verify: Login modal appears.

   TEXT/NUMBER INPUTS:
   N. Click the "[Field Label]" field and enter "[EXACT_VALUE]".
   Verify: [Field shows value/validation]
   Example: 2. Click the "Email" field and enter "user@example.com".
   Verify: Field is populated with the email address.

   DROPDOWNS/SELECTIONS:
   N. Click the "[Dropdown Label]" dropdown and select "[Exact Option Text]".
   Verify: [Dropdown closes and shows selection]
   Example: 3. Click the "Account Type" dropdown and select "Administrator".
   Verify: Selection displays in dropdown field.

   CHECKBOXES:
   N. Click the "[Label Text]" checkbox to [Check/Uncheck].
   Verify: [Related UI updates if applicable]
   Example: 4. Click the "Remember me" checkbox to check it.
   Verify: Checkbox is marked with checkmark.

   DIALOGS/MODALS:
   N. Interact with the "[Dialog/Modal Title]" dialog.
   Verify: [Fields/buttons visible]
   Example: 5. Interact with the "Confirm Action" dialog.
   Verify: Dialog contains "Yes", "No", "Cancel" buttons.

   ERROR/INFO/WARNING MESSAGES:
   N. View the "[EXACT Message Text]" [message type: error/info/warning/success] message.
   Verify: [Visible location/state]
   Example: 6. View the "Invalid email format" error message.
   Verify: Red banner appears below the email field.

   LISTS/MENU SELECTIONS:
   N. Select "[Item Text]" from the "[List/Menu Name]" menu.
   Verify: [Item highlighted/selected]
   Example: 7. Select "Report Generator" from the "Tools" menu.
   Verify: Menu item is highlighted.

   PAGE/TAB NAVIGATION:
   N. Navigate to the "[Page/Tab Name]" page.
   Verify: [Page loads and displays content]
   Example: 8. Navigate to the "Dashboard" page.
   Verify: Dashboard loads and displays welcome message.

   DOUBLE_CLICK:
   N. Double-click on the "[Item/File Name]" item.
   Verify: [What opens/executes]
   Example: 9. Double-click on the "report.pdf" file.
   Verify: PDF opens in the viewer.

   RIGHT_CLICK (CONTEXT MENUS):
   N. Right-click on "[Element Text]" to open the context menu.
   Verify: [Options visible]
   Example: 10. Right-click on "Document Name" to open the context menu.
   Verify: Menu shows "Edit", "Delete", "Share" options.

   DRAG_DROP:
   N. Drag "[Source Element]" and drop it onto the "[Target Location]".
   Verify: [Element repositioned]
   Example: 11. Drag "Task Item #3" and drop it onto the "High Priority" column.
   Verify: Item is moved to the new column.

   UPLOAD:
   N. Click the "[Upload Field Label]" field and select the file "[file_name.ext]".
   Verify: [File uploaded/confirmation]
   Example: 12. Click the "Profile Picture" field and select the file "avatar.png".
   Verify: File is uploaded and preview displays.

   KEYBOARD:
   N. Press the keyboard shortcut "[Key Combination]".
   Verify: [Action triggered/result]
   Example: 13. Press the keyboard shortcut "Ctrl+S".
   Verify: File saves and success message appears.

   TOGGLE:
   N. Toggle the "[Toggle Label]" switch to [On/Off].
   Verify: [State change and related UI updates]
   Example: 14. Toggle the "Dark Mode" switch to ON.
   Verify: Application background changes to dark theme.

   RANGE/SLIDER:
   N. Adjust the "[Slider Label]" slider to "[value/position]".
   Verify: [Value updates and UI reflects change]
   Example: 15. Adjust the "Volume" slider to "75%".
   Verify: Volume level displays as 75 and audio output changes.

   DATE/TIME PICKER:
   N. Click the "[Date Field Label]" field and select "[Date/Time]".
   Verify: [Field populated/calendar closes]
   Example: 16. Click the "Start Date" field and select "May 27, 2026".
   Verify: Field displays the selected date.

   MULTI_SELECT:
   N. Select "[Item 1]", "[Item 2]", "[Item 3]" from the "[List/Dropdown]" list.
   Verify: [All items selected]
   Example: 17. Select "Admin", "Editor", "Viewer" from the "User Roles" list.
   Verify: All three roles are highlighted with count showing "3 selected".

   SEARCH/FILTER:
   N. Click the "[Search Field Label]" field and enter "[search term]".
   Verify: [Results filtered/updated]
   Example: 18. Click the "Product Search" field and enter "laptop".
   Verify: Results display 12 matching products.

   EXPAND:
   N. Click to expand the "[Section/Item Name]" section.
   Verify: [Section expands and child items become visible]
   Example: 19. Click to expand the "Advanced Settings" section.
   Verify: Settings options expand below the section header.

   COLLAPSE:
   N. Click to collapse the "[Section/Item Name]" section.
   Verify: [Section collapses and child items are hidden]
   Example: 20. Click to collapse the "Advanced Settings" section.
   Verify: Settings options collapse and are no longer visible.

   SORT:
   N. Click the "[Column/Field Name]" column header to sort in [ascending/descending] order.
   Verify: [Data reorders accordingly]
   Example: 21. Click the "Date Created" column header to sort in descending order.
   Verify: List reorders with newest items displayed first.

4. STATE TRANSITIONS - BEFORE & AFTER:
   Each step must capture what changed as a result of the action:
   N. [ACTION STATEMENT with state details].
   Verify: [State change from before to after]
   
   Example:
   5. Click the "Save" button (currently in enabled state).
   Verify: Button becomes disabled during processing, loading spinner appears, and success message "Record saved" displays.

5. EXACT USER INPUT VALUES:
   Capture every piece of user input data exactly as recorded:
   N. Click the "[Field Name]" field and enter "[EXACT_TEXT_USED]".
   Verify: [Field displays the value]
   
   Include: text, numbers, special characters, spaces, case sensitivity
   Example: 
   - 2. Click the "Username" field and enter "qa_automation_001".
   Verify: Field displays the username.
   - 3. Click the "Password" field and enter "Secure#Pass@123!".
   Verify: Field displays password characters securely.
   - 4. Click the "Search box" field and enter "test case".
   Verify: Search results update with matching items.

6. VALIDATION & ERROR HANDLING:
   Document validation messages and error recovery steps:
   N. View the "[Validation/Error Message Text]" message.
   Verify: [Where it appears and action user takes]
   N+1. [CORRECTIVE_ACTION STATEMENT].
   Verify: [User corrects/retries/recovers]
   
   Example:
   - 7. View the "Username already exists" error message.
   Verify: Red error banner appears below the username field.
   - 8. Click the "Username" field and enter "qa_automation_002".
   Verify: Error message clears and field is updated.
   - 9. Click the "Submit" button.
   Verify: Form validates successfully and submission proceeds.

7. CONDITIONAL UI & VISIBILITY:
   If UI elements appear conditionally based on selections:
   N. [ACTION STATEMENT].
   Verify: [Description of conditional UI appearance]
   
   Example:
   - 5. Click the "Enable Advanced Options" checkbox to check it.
   Verify: Advanced settings panel expands below the checkbox.

8. LOADING STATES & TRANSITIONS:
   If recording captures loading or page transitions:
   N. View the "[Loading indicator/spinner]" loading state.
   Verify: [Data loads/processing occurs]
   N+1. [NEXT_ACTION STATEMENT].
   Verify: [New state after loading completes]
   
   Example:
   - 6. View the loading spinner on the page.
   Verify: Page data begins loading.
   - 7. Navigate to the "Results" tab.
   Verify: Results table loads and displays 25 records.

CRITICAL STEP ACCURACY REQUIREMENTS:
âœ“ Total steps = Total recorded actions (clicks + inputs + selections + state views)
âœ“ NO steps merged or combined
âœ“ NO steps skipped or omitted
âœ“ Steps in EXACT chronological order
âœ“ Each step includes EXACT UI text verbatim from screenshots
âœ“ Each step captures state changes (what's different after the action)
âœ“ Specific data values (emails, usernames, text) captured exactly
âœ“ All visible messages captured with exact text and type (error/info/warning/success)
âœ“ Error handling and recovery documented completely
âœ“ Exception: STOP button click excluded

Expected Summary:
• [Clear, verifiable outcome with EXACT UI TEXT/values]
• [Final state of application after all steps]
• [Any confirmation messages or status indicators visible]

Priority: [High / Medium / Low]
Test Type: [Functional / UI / Integration / Workflow / Navigation]
Test Data Required: [Specific values used - email format, numbers, etc.]
Estimated Duration: [Time to execute manually - e.g., 5 minutes]

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
STEP QUALITY REQUIREMENTS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âœ“ Each step is ACTIONABLE - someone can execute without guessing
âœ“ Each step includes EXACT UI TEXT from screenshots
âœ“ Each step has CLEAR intended result or outcome implied by the action
âœ“ No step is ambiguous or open to interpretation
âœ“ No irrelevant information (timestamps, pixel coordinates unless critical)
âœ“ All input values are captured (text entered, selections made)
âœ“ All validation/error messages are exact replicas of screenshot text

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
WHAT CONSTITUTES "COMPLETE WORKFLOW"
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

- ALL user actions from start to finish of the recording
- EVERY click, text input, navigation, and selection
- ANY error states encountered and how they were handled
- ANY confirmation dialogs or success messages
- FINAL state the user achieved at end of recording
- Exception: DO NOT include STOP button click steps

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
EDGE CASES & ERROR HANDLING
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

If errors occur in the recording:
- Include error message steps with EXACT error text
- Document how the user recovered from the error
- Include the corrective action taken

If form validation appears:
- Capture EXACT validation message text
- Include what field triggered the validation
- Document the input that was rejected

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
OUTPUT QUALITY CHECKLIST
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

Before finalizing, verify:
â–¡ Exactly ONE test case (not multiple)
â–¡ All UI text is EXACT replicas from screenshots
â–¡ Every step is numbered and sequential
â–¡ Every step has EXACT text and a clear expected result or outcome
â–¡ Test data is specified (not generic placeholders)
â–¡ Preconditions are complete and specific
â–¡ Priority and Test Type are appropriate
â–¡ Total workflow is cohesive and testable
â–¡ STOP button actions are excluded
â–¡ Language is clear and professional

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
IMPORTANT NOTES
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
- Format: Click on the "Exact Button Text" button, or Verify that the "Exact Text" message is displayed
- Identify all input fields, buttons, dropdowns, links, and their labels
- Include any validation messages, error messages, or confirmation texts

OUTPUT FORMATTING RULES (STRICT):
- Output plain text only. Do NOT use Markdown: no #, ##, *, **, backticks, or tables.
- Do NOT start any line with a hyphen (-), asterisk (*), bullet (•) or hash (#).
- Never wrap text in square brackets [ ]. Write real values directly. Put UI element text in double quotes.
- Each section heading is on its own line, ends with a colon, and is followed by its content on the next lines.
- Leave exactly one blank line between sections.
- Number steps as "1.", "2.", "3." with one action per line. List preconditions and expected results as numbered lines too.
- Keep short fields (ID, Name, Module, Priority, Type) as "Label: value" on one line each.

Output exactly this layout, replacing the descriptions with real content:

Test Case ID: TC_001
Test Case Name: a single comprehensive workflow name
Module / Feature: the main feature being tested

Preconditions:
1. the initial state required

Test Steps:
1. Click on the "Exact Button Text" button
2. Verify that the "Exact Text" page is displayed

Expected Results:
1. a clear, verifiable outcome including the exact UI text

Priority: High, Medium or Low
Test Type: Functional, UI, Integration or Workflow

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
//#region src/utils/formatDetailedTestCase.ts
var HEADING_LINE = new RegExp(`^(${[
	"Test Case ID",
	"Test Case Name",
	"Module / Feature",
	"Description",
	"Preconditions",
	"Test Steps",
	"Expected Summary",
	"Expected Results",
	"Priority",
	"Test Type",
	"Test Data Required",
	"Estimated Duration"
].map((h) => h.replace(/\//g, "\\/")).join("|")})\\b[^:\\n]*:`, "i");
var BULLET_SECTIONS = new Set([
	"preconditions",
	"expected summary",
	"expected results"
]);
var VERBS = {
	CLICK: "Click",
	DOUBLE_CLICK: "Double-click",
	RIGHT_CLICK: "Right-click",
	INPUT: "Enter",
	ENTER: "Enter",
	TYPE: "Enter",
	SELECT: "Select",
	CHECK: "Check",
	UNCHECK: "Uncheck",
	INTERACT: "Interact with",
	VIEW: "View",
	NAVIGATE: "Navigate",
	SCROLL: "Scroll",
	DRAG_DROP: "Drag and drop",
	UPLOAD: "Upload",
	KEYBOARD: "Press",
	TOGGLE: "Toggle",
	RANGE: "Adjust",
	DATE_PICK: "Select",
	MULTI_SELECT: "Select",
	SEARCH: "Search",
	EXPAND: "Expand",
	COLLAPSE: "Collapse",
	SORT: "Sort",
	COPY: "Copy",
	PASTE: "Paste",
	PRESS: "Press",
	HOVER: "Hover",
	OPEN: "Open",
	CLOSE: "Close"
};
function normalizeAction(action) {
	const m = /^([A-Za-z_]+)\b\s*(.*)$/.exec(action);
	if (!m) return action;
	const word = m[1];
	let rest = m[2];
	const upper = word.toUpperCase();
	if (word !== upper && word !== word.toLowerCase()) return action;
	let verb = VERBS[upper] ?? (word === upper ? word[0] + word.slice(1).toLowerCase() : word[0].toUpperCase() + word.slice(1));
	if (upper === "KEYBOARD") rest = rest.replace(/^(?:press|type)\s+/i, "");
	if (upper === "NAVIGATE" && /^to\b/i.test(rest)) verb = "Navigate";
	return `${verb}${rest ? " " + rest : ""}`.replace(/\s+\.$/, ".");
}
function formatDetailedTestCase(raw) {
	const lines = raw.replace(/\r\n/g, "\n").replace(/```[a-z]*\n?/gi, "").split("\n").map((l) => l.replace(/\*\*|__|`/g, "").trimEnd());
	const out = [];
	let section = "";
	let inBlock = false;
	const push = (line) => out.push(line);
	const blank = () => {
		if (out.length && out[out.length - 1] !== "") out.push("");
	};
	for (const original of lines) {
		const line = original.trim();
		if (!line) continue;
		const heading = HEADING_LINE.exec(line);
		if (heading) {
			section = heading[1].toLowerCase();
			const colon = line.indexOf(":");
			const label = line.slice(0, colon).trim();
			const value = line.slice(colon + 1).trim();
			const isBlock = BULLET_SECTIONS.has(section) || section === "test steps";
			if (isBlock || inBlock) blank();
			inBlock = isBlock;
			push(value ? `${label}: ${value}` : `${label}:`);
			continue;
		}
		if (section === "test steps") {
			const m = /^(\d+)[.)]\s*(.*)$/.exec(line);
			if (m) {
				const [action, ...verifyParts] = m[2].split(/\.?\s*\bVerify\s*:\s*/i);
				const verify = verifyParts.join(" ").trim();
				const cleaned = normalizeAction(action.trim().replace(/\.$/, ""));
				blank();
				push(`${m[1]}. ${cleaned}.`);
				if (verify) push(`   Verify: ${verify.replace(/^[a-z]/, (c) => c.toUpperCase())}`);
				continue;
			}
			const v = /^Verify\s*:\s*(.*)$/i.exec(line);
			if (v) {
				push(`   Verify: ${v[1]}`);
				continue;
			}
		}
		if (BULLET_SECTIONS.has(section)) {
			push(`• ${line.replace(/^(?:[-*•]|\u2022)\s*/, "")}`);
			continue;
		}
		push(line);
	}
	return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
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
async function generateTestCasesWithGemini(actions, screenshots, modelName = "gemini-2.5-flash", promptMode = "detailed", contextPrompt) {
	try {
		const apiKey = await getGeminiApiKey();
		if (!apiKey?.trim()) throw new Error("Gemini API key not found. Please configure it in Settings.");
		if (actions.length === 0) throw new Error("No actions provided for test case generation");
		const selectedPrompt = promptMode === "simple" ? GEMINI_SIMPLE_PROMPT : GEMINI_DETAILED_PROMPT;
		const genAI = new GoogleGenAI({ apiKey });
		const actionLog = formatActionsToText$1(actions);
		const prompt = `${selectedPrompt}${contextPrompt ? `\n\nADDITIONAL CONTEXT DETAIL PROMPT:\n${contextPrompt}` : ""}\n\nACTION LOG FROM RECORDING:\n${actionLog}\n\nINSTRUCTIONS:\nAnalyze the screenshots to identify all UI elements and their exact text labels, and follow the test case format and rules defined above exactly.`;
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
		return promptMode === "detailed" && !contextPrompt ? formatDetailedTestCase(text) : text;
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
async function generateTestCasesWithClaude(actions, screenshots, modelName = "claude-3-5-sonnet-20241022", contextPrompt) {
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
		const actionLog = formatActionsToText(actions);
		const userPrompt = `${contextPrompt ? `ADDITIONAL CONTEXT DETAIL PROMPT:\n${contextPrompt}\n\n` : ""}ACTION LOG:\n${actionLog}\n\nGenerate complete test cases based on this session.`;
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
//#region electron/graph/state.ts
var TestCaseSchema = z.object({
	id: z.string(),
	title: z.string(),
	priority: z.enum([
		"High",
		"Medium",
		"Low"
	]),
	type: z.enum([
		"Functional",
		"Negative",
		"Boundary",
		"UI"
	]),
	preconditions: z.array(z.string()),
	setupSteps: z.array(z.string().describe("Actions that prepare the test environment before the behavior under test.")),
	actionSteps: z.array(z.string().describe("Ordered test actions with separate, explicit Verify that... steps after important actions.")),
	cleanupSteps: z.array(z.string().describe("Actions that safely restore or remove test data after the test.")),
	expectedResult: z.string()
});
var GraphState = Annotation.Root({
	actions: Annotation(),
	screenshots: Annotation(),
	query: Annotation(),
	context: Annotation(),
	testCases: Annotation(),
	critique: Annotation(),
	formattedText: Annotation(),
	iterations: Annotation()
});
//#endregion
//#region electron/graph/nodes.ts
var normalizeActions = async (s) => {
	return { query: s.actions.map((a, index) => {
		const detail = [
			a.label,
			a.target,
			a.value,
			a.keyCombo && `key ${a.keyCombo}`,
			a.url,
			a.elementHint
		].filter(Boolean).join(" | ");
		const extras = [a.coordinates ? `at (${a.coordinates.x},${a.coordinates.y})` : "", a.windowTitle ? `window "${a.windowTitle}"` : ""].filter(Boolean).join(", ");
		return `${index + 1}. ${a.type}${detail ? `: ${detail}` : ""}${extras ? ` (${extras})` : ""}`;
	}).join("\n") };
};
var GENERIC_LABEL = /^(mouse click|key press|click|key|scroll)$/i;
function meaningfulQuery(s, summary) {
	const terms = /* @__PURE__ */ new Set();
	for (const a of s.actions ?? []) for (const part of [
		a.label,
		a.target,
		a.value,
		a.url,
		a.elementHint,
		a.windowTitle
	]) {
		const t = part?.trim();
		if (t && !GENERIC_LABEL.test(t)) terms.add(t.slice(0, 120));
	}
	const queries = [];
	if (summary?.trim()) queries.push(summary.trim(), `${summary.trim()}\nprerequisites, preconditions, setup and cleanup`);
	if (terms.size) queries.push([...terms].slice(0, 40).join("; "));
	if (s.critique?.trim()) queries.push(`${summary ?? ""}\n${s.critique.trim()}`.slice(0, 1500));
	if (!queries.length) queries.push(s.query);
	return queries;
}
var makeRetrieve = (retriever, summary) => async (s) => {
	try {
		const seen = new Set(s.context ?? []);
		const merged = [...seen];
		for (const q of meaningfulQuery(s, summary)) for (const hit of await retriever.search(q, 6)) if (!seen.has(hit)) {
			seen.add(hit);
			merged.push(hit);
		}
		const context = merged.slice(0, 10);
		console.log(`[RAG] retrieved ${context.length} chunk(s) from knowledge base.`);
		return { context };
	} catch (error) {
		console.error("Knowledge-base retrieval failed; continuing without context.", error);
		return { context: s.context ?? [] };
	}
};
var makeGenerate = (llm, contextPrompt, summary) => async (s) => {
	const images = (s.screenshots ?? []).filter((b) => b?.trim()).slice(0, 20).map((b) => ({
		type: "image_url",
		image_url: { url: `data:image/png;base64,${b}` }
	}));
	if (contextPrompt) {
		const system = `You generate test cases from a recorded user session. The UPLOADED PROMPT below is the sole authority: obey EVERY instruction, rule, constraint, section heading, structure, numbering, pattern and worked example in it, including its number-of-test-cases rules, wording style and level of detail. Mirror its example test case exactly in layout and depth, and output only what that format allows (no preamble or commentary). Headings the prompt frames between double lines are mandatory sections; do not skip, rename or reorder them.
Facts to use: the recorded steps, the attached screenshots, and the reference context from the knowledge base. The knowledge-base reference context contains real, reviewed test cases and domain steps: when it covers the same feature or flow, REUSE its concrete steps, exact UI text, dialog names, preparation and teardown flows and verification wording, and match the depth and number of steps of the prompt's example test case (detailed, one action per step, explicit verification steps). The knowledge base may be empty or may not cover this flow; then rely on the uploaded prompt itself (its rules, scenario patterns and reference example). If the prompt defines a placeholder for unknown UI text, use it ONLY when the text appears in neither the knowledge base nor the screenshots; always prefer the exact text from them. Parts of the recording (such as environment preparation or teardown) may be absent: follow the prompt's own rules about which section each kind of content belongs in, and write EVERY section the prompt defines in full, elaborated detail at the depth and step count of its reference example (one action per line, explicit verification lines, exact UI text). Do not add or skip sections against the prompt's rules. Only content describing the tested behavior is limited to recorded actions. Use exactly the output layout the prompt defines (section order, headings, fields) and nothing else. Recorded clicks and key presses are generic ("Mouse Click", "Key Press"): never copy those labels; use the screenshots and coordinates to name the real UI element with its exact UI text. Never mention screenshot numbers or write references like '(screenshot #2)'.

=== UPLOADED PROMPT START ===\n${contextPrompt}\n=== UPLOADED PROMPT END ===`;
		const user = (summary ? `Test case summary from the user:\n${summary}\n\n` : "") + `Recorded steps:\n${s.query}\n\nReference context (knowledge base):\n${s.context.length ? s.context.join("\n---\n") : "(none)"}\n\n` + (s.critique ? `Your previous output:\n${s.formattedText}\n\nA compliance reviewer found these violations of the uploaded prompt. Rewrite the full output and fix all of them:\n${s.critique}\n` : "");
		const res = await llm.invoke([{
			role: "system",
			content: system
		}, {
			role: "user",
			content: [{
				type: "text",
				text: user
			}, ...images]
		}]);
		const text = typeof res.content === "string" ? res.content : res.content.map((p) => "text" in p && typeof p.text === "string" ? p.text : "").join("");
		if (!text.trim()) throw new Error("The model returned an empty test case.");
		return {
			formattedText: text.trim(),
			iterations: (s.iterations ?? 0) + 1
		};
	}
	const structured = llm.withStructuredOutput(z.object({ testCases: z.array(TestCaseSchema) }));
	const system = "You are a senior QA engineer. Write complete, executable test cases from the recorded user actions. Put environment preparation and account/project creation in setupSteps, only the behavior being tested in actionSteps, and teardown or data deletion in cleanupSteps. Do not put all actions into one list. Keep preconditions limited to facts that must already be true before setup begins. In actionSteps, represent important actions and their checks as separate ordered strings: after each major state change, submission, connection, save, or sync, include a distinct step beginning with 'Verify that...' and name the observable expected state. Do not combine the action and its verification into one string, and do not invent UI elements or outcomes. Use the reference context for domain guidance, not as evidence that an unrecorded action occurred. Write each action step using the exact wording of the matching recorded action (button, field, menu and page names verbatim); the user's summary describes intent only and never replaces recorded actions. Recorded mouse clicks and key presses are generic (\"Mouse Click\", \"Key Press\"): never copy those labels as steps. Use the attached screenshots and click coordinates to identify the actual UI element clicked or field typed into, and write steps like 'Click the \"Save\" button'. Never mention screenshot numbers or write references such as '(screenshot #2)'. Consecutive key presses are typing into the focused field. When the session covers several distinct scenarios or features, return multiple separate test cases, each with its own meaningful steps.";
	const user = (summary ? `Test case summary from the user:\n${summary}\n\n` : "") + `Recorded steps:\n${s.query}\n\nReference context:\n${s.context.length ? s.context.join("\n---\n") : "(none)"}\n\n` + (s.critique ? `A reviewer found these problems. Fix them:\n${s.critique}\n` : "");
	return {
		testCases: (await structured.invoke([{
			role: "system",
			content: system
		}, {
			role: "user",
			content: [{
				type: "text",
				text: user
			}, ...images]
		}])).testCases,
		iterations: (s.iterations ?? 0) + 1
	};
};
var FormatSpecSchema = z.object({
	requiredLabels: z.array(z.string()).describe("Literal section headings and field labels (without trailing colon) that the prompt's mandatory output format requires on their own line in every output, in order."),
	forbiddenLabels: z.array(z.string()).describe("Literal headings or labels the prompt's format explicitly excludes but a model might wrongly add (e.g. the prompt says 'No test ID'). Usually empty."),
	stepSections: z.array(z.string()).describe("Subset of requiredLabels that are lists of numbered steps.")
});
var specCache = /* @__PURE__ */ new Map();
function extractFormatSpec(judge, contextPrompt) {
	let spec = specCache.get(contextPrompt);
	if (!spec) {
		spec = judge.withStructuredOutput(FormatSpecSchema).invoke(`Read the prompt below and extract ONLY the literal layout of its mandatory OUTPUT format (the headings and field labels the generated output must contain). Copy labels exactly as written in the prompt's format template or reference example. Ignore instructions that are not output headings or field labels. If the prompt defines no fixed layout, return empty arrays.

PROMPT:\n${contextPrompt}`).catch((error) => {
			console.error("Could not extract the output format from the uploaded prompt; using reviewer only.", error);
			specCache.delete(contextPrompt);
			return {
				requiredLabels: [],
				forbiddenLabels: [],
				stepSections: []
			};
		});
		specCache.set(contextPrompt, spec);
	}
	return spec;
}
var escapeRe = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var labelLine = (label) => new RegExp(`^\\W*${escapeRe(label.trim())}\\W*(?::.*)?$`, "im");
var numberedCount = (block) => (block.match(/^\s*(?:Step\s*)?\d+[.)]?\s+\S/gim) ?? []).length;
function structuralIssues(text, spec) {
	const issues = [];
	const labels = spec.requiredLabels.map((l) => l.trim()).filter(Boolean);
	const positions = labels.map((l) => labelLine(l).exec(text)?.index ?? -1);
	labels.forEach((l, i) => {
		if (positions[i] === -1) issues.push(`Missing the '${l}' heading/field required by the prompt's output format.`);
	});
	for (const f of spec.forbiddenLabels.map((l) => l.trim()).filter(Boolean)) if (labelLine(f).test(text)) issues.push(`Remove '${f}': it is not part of the prompt's output format.`);
	for (const section of spec.stepSections) {
		const i = labels.indexOf(section.trim());
		if (i === -1 || positions[i] === -1) continue;
		const later = positions.filter((p) => p > positions[i]);
		const end = later.length ? Math.min(...later) : text.length;
		if (numberedCount(text.slice(positions[i], end)) === 0) issues.push(`The '${section}' section has no numbered steps.`);
	}
	return issues;
}
var makeValidate = (judge, summary, contextPrompt) => async (s) => {
	if (contextPrompt) {
		const structural = structuralIssues(s.formattedText ?? "", await extractFormatSpec(judge, contextPrompt));
		if (structural.length) return { critique: structural.map((i) => `- ${i}`).join("\n") };
		const verdict = await judge.withStructuredOutput(z.object({
			pass: z.boolean(),
			critique: z.string()
		})).invoke(`You are a strict compliance reviewer. Check the generated output against EVERY instruction, rule, section heading (including those framed between double lines), structure, numbering, pattern and example in the uploaded prompt, and against the recorded steps (no invented actions, no generic 'Mouse Click'/'Key Press' steps, no screenshot-number references). Fail if anything is missing, renamed, reordered, or deviates from the prompt's format. Also fail if the output is less detailed (fewer, coarser steps, missing verification steps) than the prompt's example test case, if it uses a placeholder for text that IS available in the knowledge base or screenshots, if any section ignores the prompt's own rules about what belongs in it, or if the knowledge-base reference context has relevant concrete steps, UI text or flows that were ignored. List each violation concisely.

UPLOADED PROMPT:\n${contextPrompt}\n\n` + (summary ? `Test case summary from the user:\n${summary}\n\n` : "") + `Knowledge-base reference context:\n${s.context?.length ? s.context.join("\n---\n") : "(none)"}\n\nRecorded steps:\n${s.query}\n\nGenerated output:\n${s.formattedText}`);
		return { critique: verdict.pass ? "" : verdict.critique };
	}
	const verdict = await judge.withStructuredOutput(z.object({
		pass: z.boolean(),
		critique: z.string()
	})).invoke("Review these test cases against the recorded steps. Check: (1) setup, core actions, and cleanup are in their separate fields, (2) every recorded core action is covered and ordered, (3) important state changes, submissions, connections, saves, and syncs have a separate following actionSteps entry beginning 'Verify that...' with an observable result, (4) no action or outcome is invented, and (5) expected results are specific. If a verification is missing or a workflow is incorrectly grouped, fail and explain the correction.\n\n" + (summary ? `Test case summary from the user:\n${summary}\n\n` : "") + `Recorded steps:\n${s.query}\n\nTest cases:\n${JSON.stringify(s.testCases, null, 2)}`);
	return { critique: verdict.pass ? "" : verdict.critique };
};
//#endregion
//#region electron/graph/index.ts
var MAX_ITERATIONS = 4;
function buildGraph(deps) {
	return new StateGraph(GraphState).addNode("normalize", normalizeActions).addNode("retrieve", deps.useRag ? makeRetrieve(deps.retriever, deps.testCaseSummary) : async () => ({ context: [] })).addNode("generate", makeGenerate(deps.generator, deps.contextPrompt, deps.testCaseSummary)).addNode("validate", makeValidate(deps.judge, deps.testCaseSummary, deps.contextPrompt)).addEdge(START, "normalize").addEdge("normalize", "retrieve").addEdge("retrieve", "generate").addEdge("generate", "validate").addConditionalEdges("validate", (s) => s.critique && s.iterations < MAX_ITERATIONS ? deps.useRag ? "retrieve" : "generate" : END).compile();
}
//#endregion
//#region electron/graph/models.ts
function makeChatModel(provider, model, apiKey) {
	return provider === "claude" ? new ChatAnthropic({
		model,
		apiKey,
		temperature: .2,
		maxTokens: 8192
	}) : new ChatGoogleGenerativeAI({
		model,
		apiKey,
		temperature: .2,
		maxOutputTokens: 16384
	});
}
//#endregion
//#region electron/rag/ingest.ts
async function splitJson(text, splitter) {
	try {
		const parsed = JSON.parse(text);
		if (Array.isArray(parsed) && parsed.length) return parsed.map((item) => JSON.stringify(item, null, 2));
		return splitter.splitText(JSON.stringify(parsed, null, 2));
	} catch {
		return splitter.splitText(text);
	}
}
var MAX_CHUNK = 4e3;
async function splitText(text, splitter) {
	const sections = text.split(/\n(?=\s*(?:Summary\s*:|#{1,3}\s|(?:Test\s*Case|TC)[\s_-]*\d+))/i).map((s) => s.trim()).filter(Boolean);
	const out = [];
	for (const section of sections) if (section.length <= MAX_CHUNK) out.push(section);
	else out.push(...await splitter.splitText(section));
	return out;
}
async function ingestFiles(retriever, files) {
	const splitter = new RecursiveCharacterTextSplitter({
		chunkSize: 3e3,
		chunkOverlap: 200
	});
	const docs = [];
	for (const file of files) {
		const ext = path$1.extname(file).toLowerCase();
		if (ext !== ".md" && ext !== ".txt" && ext !== ".json") continue;
		const text = await fs$1.readFile(file, "utf8");
		(ext === ".json" ? await splitJson(text, splitter) : await splitText(text, splitter)).filter((c) => c.trim()).forEach((c) => docs.push({
			text: c,
			meta: { source: path$1.basename(file) }
		}));
	}
	await retriever.ingest(docs);
	return docs.length;
}
async function ingestApprovedCases(retriever, cases, feature) {
	const docs = cases.map((c) => ({
		text: typeof c === "string" ? c : JSON.stringify(c),
		meta: {
			source: "approved-test-case",
			feature
		}
	}));
	await retriever.ingest(docs);
}
//#endregion
//#region electron/rag/lancedbRetriever.ts
var TABLE = "knowledge_base";
var LanceRetriever = class {
	dir;
	embeddings;
	db;
	constructor(dir, embeddings) {
		this.dir = dir;
		this.embeddings = embeddings;
	}
	async connect() {
		if (!this.db) this.db = await lancedb.connect(this.dir);
		return this.db;
	}
	async ingest(docs) {
		docs = docs.filter((d) => d.text.trim().length > 0);
		if (!docs.length) return;
		const db = await this.connect();
		const vectors = (await this.embeddings.embedDocuments(docs.map((d) => d.text))).map((v) => Array.from(v ?? [], Number));
		const dim = vectors[0]?.length ?? 0;
		if (vectors.length !== docs.length || dim === 0 || vectors.some((v) => v.length !== dim || v.some(Number.isNaN))) throw new Error("Gemini returned no embeddings for the uploaded text. Check the Gemini API key, model access, and quota, then try again.");
		const rows = docs.map((d, i) => ({
			vector: vectors[i],
			text: d.text,
			source: d.meta.source ?? "",
			feature: d.meta.feature ?? ""
		}));
		if ((await db.tableNames()).includes(TABLE)) await (await db.openTable(TABLE)).add(rows);
		else await db.createTable(TABLE, rows);
	}
	async search(query, k) {
		const db = await this.connect();
		if (!(await db.tableNames()).includes(TABLE)) return [];
		const t = await db.openTable(TABLE);
		const qv = await this.embeddings.embedQuery(query);
		return (await t.search(qv).limit(k).toArray()).map((row) => row.text);
	}
	async count() {
		const db = await this.connect();
		if (!(await db.tableNames()).includes(TABLE)) return 0;
		return (await db.openTable(TABLE)).countRows();
	}
	static async list(dir) {
		const db = await lancedb.connect(dir);
		if (!(await db.tableNames()).includes(TABLE)) return [];
		return (await (await db.openTable(TABLE)).query().select([
			"text",
			"source",
			"feature"
		]).toArray()).map((row, i) => ({
			id: i + 1,
			text: String(row.text ?? ""),
			source: String(row.source ?? ""),
			feature: String(row.feature ?? "")
		}));
	}
	static async clear(dir) {
		const db = await lancedb.connect(dir);
		if ((await db.tableNames()).includes(TABLE)) await db.dropTable(TABLE);
	}
};
//#endregion
//#region electron/rag/embeddings.ts
var StrictGeminiEmbeddings = class extends GoogleGenerativeAIEmbeddings {
	async _embedDocumentsContent(documents) {
		const self = this;
		const out = [];
		for (let i = 0; i < documents.length; i += this.maxBatchSize) {
			const chunk = documents.slice(i, i + this.maxBatchSize);
			const res = await self.client.batchEmbedContents({ requests: chunk.map((d) => ({
				...self._convertToContent(d),
				taskType: "RETRIEVAL_DOCUMENT"
			})) });
			for (const e of res.embeddings ?? []) out.push(e.values ?? []);
		}
		return out;
	}
	async _embedQueryContent(text) {
		const self = this;
		return (await self.client.embedContent({
			...self._convertToContent(text),
			taskType: "RETRIEVAL_QUERY"
		})).embedding?.values ?? [];
	}
};
function makeEmbeddings(geminiApiKey) {
	return new StrictGeminiEmbeddings({
		model: "gemini-embedding-001",
		apiKey: geminiApiKey
	});
}
//#endregion
//#region electron/deepEval.ts
var MAX_FILE_BYTES = 2e5;
var TIMEOUT_MS = 5 * 6e4;
var METRICS = new Set([
	"completeness",
	"clarity",
	"correctness",
	"format",
	"answer_relevancy",
	"faithfulness",
	"contextual_relevancy"
]);
var pickedPaths = /* @__PURE__ */ new Map();
var activeRun = null;
function evalDir() {
	return app.isPackaged ? path.join(process.resourcesPath, "eval") : path.join(app.getAppPath(), "eval");
}
function pythonExecutable() {
	if (process.env.TESTFORGE_PYTHON) return process.env.TESTFORGE_PYTHON;
	const venvPython = process.platform === "win32" ? path.join(evalDir(), ".venv", "Scripts", "python.exe") : path.join(evalDir(), ".venv", "bin", "python");
	if (fs.existsSync(venvPython)) return venvPython;
	return process.platform === "win32" ? "python" : "python3";
}
function runPython(args, env = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(pythonExecutable(), ["run_eval.py", ...args], {
			cwd: evalDir(),
			env: {
				...process.env,
				...env,
				PYTHONIOENCODING: "utf-8",
				DEEPEVAL_TELEMETRY_OPT_OUT: "YES"
			},
			windowsHide: true
		});
		activeRun = child;
		let stdout = "";
		let stderr = "";
		const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
		child.stdout.on("data", (d) => {
			stdout += d;
		});
		child.stderr.on("data", (d) => {
			stderr += d;
		});
		child.on("error", (err) => {
			clearTimeout(timer);
			activeRun = null;
			reject(err);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			if (activeRun === child) activeRun = null;
			resolve({
				stdout,
				stderr,
				code
			});
		});
	});
}
function lastJsonLine(stdout) {
	const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
	for (let i = lines.length - 1; i >= 0; i--) if (lines[i].startsWith("{")) return JSON.parse(lines[i]);
	throw new Error("The evaluator returned no result.");
}
function resolvePicked(id) {
	const p = typeof id === "string" ? pickedPaths.get(id) : void 0;
	if (!p) throw new Error("Select the file again.");
	return p;
}
function setupDeepEvalHandlers() {
	ipcMain.handle("deepeval:check", async () => {
		try {
			const { stdout, stderr, code } = await runPython(["--check"]);
			if (code !== 0) return {
				ok: false,
				message: stderr.trim().split("\n").pop() || "DeepEval is not installed."
			};
			return lastJsonLine(stdout);
		} catch {
			return {
				ok: false,
				message: "Python was not found. Install Python 3.9+ or set TESTFORGE_PYTHON."
			};
		}
	});
	ipcMain.handle("deepeval:pick-file", async (event, kind) => {
		if (!["testcase", "context"].includes(kind)) throw new Error("Invalid file kind.");
		const options = {
			properties: ["openFile"],
			filters: [{
				name: "Text files",
				extensions: ["txt"]
			}]
		};
		const owner = BrowserWindow.fromWebContents(event.sender);
		const res = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
		const selected = res.filePaths[0];
		if (res.canceled || !selected) return null;
		const stat = fs.statSync(selected);
		if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new Error("The file must be a .txt file of 200 KB or less.");
		pickedPaths.set(kind, selected);
		return {
			name: path.basename(selected),
			preview: fs.readFileSync(selected, "utf8")
		};
	});
	ipcMain.handle("deepeval:run", async (_, req) => {
		if (activeRun) throw new Error("An evaluation is already running.");
		if (req?.provider !== "claude" && req?.provider !== "gemini") throw new Error("Invalid judge provider.");
		const model = String(req.model ?? "").trim();
		if (!/^[\w.\-:/]{1,100}$/.test(model)) throw new Error("Invalid judge model ID.");
		const metrics = (req.metrics ?? []).filter((m) => METRICS.has(m));
		if (metrics.length === 0) throw new Error("Select at least one metric.");
		const threshold = Math.min(1, Math.max(0, Number(req.threshold) || .5));
		const apiKey = req.provider === "claude" ? await getClaudeApiKey() : await getGeminiApiKey();
		if (!apiKey) throw new Error(`Add a ${req.provider === "claude" ? "Claude" : "Gemini"} API key in Settings.`);
		const args = [
			"--file",
			resolvePicked("testcase"),
			"--provider",
			req.provider,
			"--model",
			model,
			"--metrics",
			metrics.join(","),
			"--threshold",
			String(threshold)
		];
		if (req.hasContext) args.push("--context", resolvePicked("context"));
		const summary = typeof req.summary === "string" ? req.summary.trim().slice(0, 1e3) : "";
		if (summary) args.push("--input-text", summary);
		const { stdout, stderr, code } = await runPython(args, req.provider === "claude" ? { ANTHROPIC_API_KEY: apiKey } : { GOOGLE_API_KEY: apiKey });
		if (code !== 0) throw new Error(stderr.trim().split("\n").pop()?.replace(apiKey, "***") || "Evaluation failed or was cancelled.");
		return lastJsonLine(stdout);
	});
	ipcMain.handle("deepeval:cancel", () => {
		activeRun?.kill();
		return { cancelled: true };
	});
	ipcMain.handle("deepeval:clear-file", (_, kind) => {
		pickedPaths.delete(kind);
		return true;
	});
}
//#endregion
//#region electron/ipcHandlers.ts
var lanceRetrieverPromise;
async function getLanceRetriever() {
	if (!lanceRetrieverPromise) lanceRetrieverPromise = (async () => {
		const apiKey = await getGeminiApiKey();
		if (!apiKey) throw new Error("Add a Gemini API key to use the knowledge base.");
		return new LanceRetriever(path.join(app.getPath("userData"), "kb"), makeEmbeddings(apiKey));
	})();
	try {
		return await lanceRetrieverPromise;
	} catch (error) {
		lanceRetrieverPromise = void 0;
		throw error;
	}
}
async function getProviderApiKey(provider) {
	const apiKey = provider === "claude" ? await getClaudeApiKey() : await getGeminiApiKey();
	if (!apiKey) throw new Error(`Add a ${provider === "claude" ? "Claude" : "Gemini"} API key in Settings.`);
	return apiKey;
}
var CONTEXT_PROMPT_FILE = "context-detail-prompt.json";
function getContextPromptPath() {
	return path.join(app.getPath("userData"), CONTEXT_PROMPT_FILE);
}
function readContextPrompt() {
	const promptPath = getContextPromptPath();
	if (!fs.existsSync(promptPath)) return null;
	const saved = JSON.parse(fs.readFileSync(promptPath, "utf8"));
	if (typeof saved.filename !== "string" || typeof saved.content !== "string") return null;
	return {
		filename: saved.filename,
		content: saved.content
	};
}
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
			lanceRetrieverPromise = void 0;
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
	ipcMain.handle("testcases:generate", async (event, payload) => {
		const provider = payload.provider;
		const judgeProvider = payload.judgeProvider ?? provider;
		const contextPrompt = readContextPrompt()?.content;
		if (!payload.useUploadedPrompt) throw new Error("Knowledge-base generation is only available with the uploaded prompt.");
		if (!contextPrompt) throw new Error("The uploaded context prompt is unavailable. Upload it again in Settings.");
		const graph = buildGraph({
			retriever: await getLanceRetriever(),
			generator: makeChatModel(provider, payload.model, await getProviderApiKey(provider)),
			judge: makeChatModel(judgeProvider, payload.judgeModel ?? payload.model, await getProviderApiKey(judgeProvider)),
			useRag: payload.useRag !== false,
			contextPrompt,
			testCaseSummary: typeof payload.testCaseSummary === "string" ? payload.testCaseSummary.slice(0, 2e3) : void 0
		});
		try {
			const stream = await graph.stream({
				actions: payload.actions,
				screenshots: payload.screenshots ?? [],
				query: "",
				context: [],
				testCases: [],
				critique: "",
				iterations: 0
			}, { streamMode: ["updates", "values"] });
			let finalState;
			for await (const [mode, data] of stream) if (mode === "updates") event.sender.send("testcases:progress", Object.keys(data)[0]);
			else finalState = data;
			if (contextPrompt) {
				if (!finalState?.formattedText?.trim()) throw new Error("The generation graph returned no test cases.");
				return finalState.formattedText;
			}
			if (!finalState?.testCases?.length) throw new Error("The generation graph returned no test cases.");
			return finalState.testCases;
		} catch (error) {
			console.error("LangGraph generation failed:", error);
			throw error;
		}
	});
	ipcMain.handle("kb:addFiles", async (event) => {
		const options = {
			properties: ["openFile", "multiSelections"],
			filters: [{
				name: "Documents",
				extensions: [
					"md",
					"txt",
					"json"
				]
			}]
		};
		const owner = BrowserWindow.fromWebContents(event.sender);
		const res = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
		if (res.canceled) return { added: 0 };
		return { added: await ingestFiles(await getLanceRetriever(), res.filePaths) };
	});
	ipcMain.handle("kb:count", async () => (await getLanceRetriever()).count());
	ipcMain.handle("kb:list", async () => LanceRetriever.list(path.join(app.getPath("userData"), "kb")));
	ipcMain.handle("kb:clear", async () => {
		await LanceRetriever.clear(path.join(app.getPath("userData"), "kb"));
		return { cleared: true };
	});
	ipcMain.handle("kb:ingest-approved", async (_, payload) => {
		if (!Array.isArray(payload?.cases) || payload.cases.length === 0) throw new Error("No approved test cases were provided.");
		const feature = typeof payload.feature === "string" ? payload.feature.slice(0, 120) : "recorded-session";
		await ingestApprovedCases(await getLanceRetriever(), payload.cases, feature);
		return { added: payload.cases.length };
	});
	ipcMain.handle("context-prompt:get", () => {
		const prompt = readContextPrompt();
		return prompt ? {
			filename: prompt.filename,
			exists: true
		} : {
			filename: null,
			exists: false
		};
	});
	ipcMain.handle("context-prompt:upload", async (event) => {
		const options = {
			properties: ["openFile"],
			filters: [{
				name: "Prompt files",
				extensions: ["md", "txt"]
			}]
		};
		const owner = BrowserWindow.fromWebContents(event.sender);
		const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
		if (result.canceled || !result.filePaths[0]) return { filename: null };
		const selectedPath = result.filePaths[0];
		const content = fs.readFileSync(selectedPath, "utf8").trim();
		if (!content) throw new Error("The selected prompt file is empty.");
		if (Buffer.byteLength(content, "utf8") > 1e5) throw new Error("Prompt files must be 100 KB or smaller.");
		const filename = path.basename(selectedPath);
		fs.writeFileSync(getContextPromptPath(), JSON.stringify({
			filename,
			content
		}), "utf8");
		return { filename };
	});
	ipcMain.handle("context-prompt:clear", () => {
		const promptPath = getContextPromptPath();
		if (fs.existsSync(promptPath)) fs.unlinkSync(promptPath);
		return { cleared: true };
	});
	setupDeepEvalHandlers();
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
