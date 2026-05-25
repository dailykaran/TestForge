# How TestForge Converts AI-Powered Services into AI Agents

## Overview

TestForge orchestrates Claude and Gemini APIs to function as **intelligent test case generation agents** by:

1. **Capturing** user interactions systematically
2. **Preparing** context (actions + screenshots)
3. **Prompting** AI with domain-specific instructions
4. **Orchestrating** AI reasoning through structured workflows
5. **Exporting** outputs to actionable test documentation

---

## Detailed Data Flow Architecture

### Phase 1: Action Capture & Observation

**File**: `electron/actionObserver.ts`

The application captures user interactions at the system level:

```typescript
// System-level event listeners
uIOhook.on('click', async (e) => {
  const screenshotPath = await captureScreenshot();
  sendAction({
    id: uuidv4(),
    timestamp: Date.now(),
    type: ActionType.CLICK,
    coordinates: { x: e.x, y: e.y },
    screenshotPath: screenshotPath
  });
});

uIOhook.on('keydown', (e) => {
  sendAction({
    type: ActionType.KEY_PRESS,
    keyCombo: e.keycode.toString()
  });
});
```

**What it captures:**
- Clicks, double-clicks, right-clicks
- Keyboard input
- Scrolling
- Navigation events
- Window open/close
- Input field changes
- Dropdown selections
- Screenshots for each major action

**Action Types Supported:**
```typescript
enum ActionType {
  CLICK = 'click',
  DOUBLE_CLICK = 'double_click',
  RIGHT_CLICK = 'right_click',
  KEY_PRESS = 'key_press',
  SCROLL = 'scroll',
  DRAG = 'drag',
  WINDOW_OPEN = 'window_open',
  NAVIGATION = 'navigation',
  INPUT = 'input',
  DROPDOWN = 'dropdown',
  SCREENSHOT_TRIGGER = 'screenshot_trigger',
}
```

**Stored in**: `src/store/useAppStore.ts`

```typescript
interface AppState {
  actions: ActionEvent[];  // Array of captured interactions
  videoPath: string | null;
  selectedSourceId: string | null;
  defaultModel: string;
  audioEnabled: boolean;
  videoEnabled: boolean;
}
```

---

### Phase 2: AI Agent Initialization & Context Preparation

**File**: `src/pages/Review.tsx`

When the user clicks "Generate Test Cases", the application:

1. **Retrieves stored actions** from state
2. **Loads screenshots** from disk
3. **Converts to base64** for API transmission
4. **Formats into a context log**

```typescript
// Review page - triggered by user action
const handleGenerateTestCases = async () => {
  setIsGenerating(true);
  
  try {
    // Actions collected during recording
    const sessionActions = actions;
    
    // Screenshots converted to base64
    const screenshotB64Array = await Promise.all(
      actions
        .filter(a => a.screenshotPath)
        .map(a => window.ipcRenderer.invoke('read-file-base64', a.screenshotPath))
    );
    
    // IPC to main process for AI generation
    const testCases = await window.ipcRenderer.invoke(
      'generate-test-cases',
      sessionActions,
      screenshotB64Array,
      defaultModel
    );
    
    setTestCases(testCases);
  } finally {
    setIsGenerating(false);
  }
};
```

**Data Structure of ActionEvent:**
```typescript
interface ActionEvent {
  id: string;                          // Unique identifier (UUID)
  timestamp: number;                   // Milliseconds since epoch
  type: ActionType;                    // Type of action
  label: string;                       // Human-readable label
  coordinates?: { x: number; y: number };  // Mouse position
  keyCombo?: string;                   // Keyboard key code
  screenshotPath?: string;             // Path to screenshot file
  windowTitle?: string;                // Application window title
  url?: string;                        // Navigation URL
  elementHint?: string;                // UI element identifier
}
```

---

### Phase 3: AI Agent Processing - Claude Service

**File**: `src/services/claudeService.ts`

The Claude agent receives:

1. **System Prompt** (instructions)
2. **Visual Context** (screenshots)
3. **Action Log** (user interactions)

```typescript
export async function generateTestCasesWithClaude(
  actions: ActionEvent[],
  screenshots: string[],  // base64 encoded
  apiKey: string,
  modelName: string = 'claude-3-5-sonnet-20241022'
): Promise<string> {
  const client = new Anthropic({ 
    apiKey, 
    dangerouslyAllowBrowser: true,
  });

  // Convert actions to readable log
  const actionLog = formatActionsToText(actions);
  // Output example: "[2026-05-25T10:30:00Z] [CLICK] — Mouse Click | Coords: 512,768"

  // Build multimodal content
  const imageContent = screenshots.map(b64 => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/png' as const,
      data: b64,
    },
  }));

  // API call with system + context
  const response = await client.messages.create({
    model: modelName,  // e.g., 'claude-3-5-sonnet-20241022'
    max_tokens: 4096,
    system: SYSTEM_PROMPT,  // See below
    messages: [
      {
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `ACTION LOG:\n${actionLog}\n\nGenerate complete test cases based on this session.`,
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
}
```

**System Prompt (Agent Instructions)**:

```
You are a professional QA Engineer and Test Architect.
Your task is to analyze a sequence of user interactions recorded from a screen recording session 
and generate formal, structured software test cases.

Each test case must follow this structure:
- Test Case ID: TC_[number]
- Test Case Name: [Descriptive Name]
- Module / Feature: [Inferred from actions]
- Preconditions: [What must be true before the test]
- Test Steps: [Numbered, atomic steps]
- Expected Results: [Clear, verifiable outcomes]
- Priority: [High / Medium / Low]
- Test Type: [Functional / UI / Navigation / Regression]
```

**Supported Claude Models:**
- `claude-3-5-sonnet-20241022` - High-quality output, best for complex workflows
- `claude-3-5-haiku-20241022` - Faster, lightweight processing for simple tasks

---

### Phase 4: AI Agent Processing - Gemini Service

**File**: `src/services/geminiService.ts`

Similar to Claude but with Google's Gemini API:

```typescript
export async function generateTestCasesWithGemini(
  actions: ActionEvent[],
  screenshots: string[],
  apiKey: string,
  modelName: string = 'gemini-3.1-flash-lite'
): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey });

  const actionLog = formatActionsToText(actions);
  
  // Emphasis: Extract exact UI text
  const prompt = `${SYSTEM_PROMPT}
  
  ACTION LOG FROM RECORDING:
  ${actionLog}
  
  INSTRUCTIONS:
  1. Analyze the screenshots provided to identify all UI elements and their exact text labels
  2. Create ONE single test case that represents the complete workflow shown in this session
  3. In each test step, reference the EXACT UI text for buttons, fields, menus, and messages
  4. Include visual verification points to confirm expected UI states
  5. Do NOT generate multiple test cases - generate only ONE consolidated test case`;

  // Build content with screenshots
  const contentParts = [{ text: prompt }];
  
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
    model: modelName,  // e.g., 'gemini-2.0-flash'
    contents: [{ parts: contentParts }],
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
}
```

**System Prompt (Gemini Specific)**:

```
You are a professional QA Engineer and Test Architect specializing in UI/UX testing.

CRITICAL REQUIREMENT: Generate ONLY ONE consolidated test case per video session. 
Do NOT generate multiple test cases.

Your task: Analyze user interactions and screenshots to create a single, comprehensive 
test case that covers the complete user workflow.

EMPHASIS ON UI TEXT:
- Extract and include EXACT UI element text from screenshots 
  (button labels, field names, menu items, error messages, etc.)
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
```

**Supported Gemini Models:**
- `gemini-2.0-flash` - Fast, cost-effective responses
- `gemini-3.1-flash-lite` - Lightweight, optimized variant
- `gemini-3.1-pro` - Advanced reasoning capabilities
- `gemini-3-pro` - Standard professional model

---

### Phase 5: IPC Orchestration

**File**: `electron/ipcHandlers.ts`

The main process orchestrates the AI agent calls:

```typescript
// Route AI generation requests based on selected model
ipcMain.handle(IPC_CHANNELS['generate-test-cases'], async (_, actions, screenshots, modelName) => {
  try {
    if (modelName.includes('claude')) {
      // Delegate to Claude agent
      return await generateTestCasesWithClaude(
        actions,
        screenshots,
        getClaudeApiKey(),
        modelName
      );
    } else if (modelName.includes('gemini')) {
      // Delegate to Gemini agent
      return await generateTestCasesWithGemini(
        actions,
        screenshots,
        getGeminiApiKey(),
        modelName
      );
    } else {
      throw new Error(`Unsupported model: ${modelName}`);
    }
  } catch (error) {
    console.error('Test case generation error:', error);
    throw new Error(`Test case generation failed: ${error.message}`);
  }
});
```

**IPC Channel Structure:**

```typescript
IPC_CHANNELS = {
  'get-desktop-sources': 'get-desktop-sources',
  'save-video': 'save-video',
  'start-observing': 'start-observing',
  'stop-observing': 'stop-observing',
  'set-generator-active': 'set-generator-active',
  'session-memory-clear': 'session-memory-clear',
  'read-file-base64': 'read-file-base64',
  'generate-test-cases': 'generate-test-cases',
  'get-claude-api-key': 'get-claude-api-key',
  'set-claude-api-key': 'set-claude-api-key',
  'get-gemini-api-key': 'get-gemini-api-key',
  'set-gemini-api-key': 'set-gemini-api-key',
}
```

---

### Phase 6: Export & Document Generation

**File**: `src/services/exportService.ts`

The generated test cases are converted to professional documentation:

```typescript
export async function exportToDocx(testCasesContent: string): Promise<Blob> {
  try {
    if (!testCasesContent?.trim()) {
      throw new Error('Content cannot be empty');
    }

    const lines = testCasesContent.split('\n').filter(Boolean);
    
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: lines.map(line => 
            new Paragraph({
              children: [new TextRun(line.trim())],
            })
          ),
        },
      ],
    });

    return await Packer.toBlob(doc);  // Export as .docx
  } catch (error) {
    throw new Error(`Failed to export to DOCX: ${error.message}`, { cause: error });
  }
}

export function exportToTxt(testCasesContent: string): Blob {
  if (!testCasesContent?.trim()) {
    throw new Error('Content cannot be empty');
  }

  return new Blob([testCasesContent], { type: 'text/plain' });
}
```

**Export Formats Supported:**
- **DOCX** - Microsoft Word document (professional formatting)
- **TXT** - Plain text file (universal compatibility)

---

## How This Creates an AI Agent

| **Agent Characteristic** | **How TestForge Implements It** |
|---|---|
| **Perception** | Captures user actions + visual context (screenshots) via system-level hooks |
| **Reasoning** | Sends structured prompts to Claude/Gemini LLMs with full context |
| **Decision-Making** | AI analyzes interactions and decides optimal test structure and format |
| **Action Execution** | Generates test case output in structured QA format |
| **Tool Integration** | Uses IPC to coordinate native capture, API calls, file export |
| **Goal Orientation** | Specific prompts instruct AI to produce QA-formatted test cases |
| **Context Awareness** | Understands workflow sequences and UI element relationships |
| **Multimodal Processing** | Processes both text (action log) and images (screenshots) |

---

## Complete Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER INTERACTION RECORDING                               │
│    - Desktop actions captured by actionObserver             │
│    - Screenshots taken at each action                       │
│    - Data stored in Zustand store                           │
│    - Window/application context preserved                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ 2. REVIEW PAGE - USER TRIGGERS AI GENERATION                │
│    - Actions array retrieved from store                     │
│    - Screenshots converted to base64                        │
│    - Selects AI model (Claude or Gemini)                    │
│    - IPC message sent to main process                       │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ 3. IPC HANDLER ROUTES TO AI SERVICE                         │
│    - Validates model selection                              │
│    - Retrieves appropriate API key                          │
│    - Calls appropriate API handler                          │
└─────────────────────┬───────────────────────────────────────┘
                      │
        ┌─────────────┴────────────────┐
        │                              │
┌───────▼─────────────┐    ┌───────────▼─────────────┐
│ CLAUDE AGENT        │    │ GEMINI AGENT            │
│ - System Prompt     │    │ - System Prompt         │
│ - Action Log        │    │ - Action Log            │
│ - Screenshots       │    │ - Screenshots           │
│ - max_tokens: 4096  │    │ - Emphasis on UI text   │
│ - Anthropic API     │    │ - Google GenAI API      │
│ - Response parsing  │    │ - Response parsing      │
└───────┬─────────────┘    └───────────┬─────────────┘
        │                              │
        └─────────────┬────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ 4. AI AGENT OUTPUT - STRUCTURED TEST CASES                  │
│    - Test Case ID (TC_###)                                  │
│    - Test Name (descriptive workflow name)                  │
│    - Module / Feature                                       │
│    - Preconditions                                          │
│    - Test Steps (with exact UI text references)             │
│    - Expected Results (with verification points)            │
│    - Priority (High / Medium / Low)                         │
│    - Test Type (Functional / UI / Navigation / etc)         │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│ 5. EXPORT TO DOCUMENT                                       │
│    - Format selection (DOCX or TXT)                         │
│    - Convert to professional Word document                  │
│    - Generate formatted output                              │
│    - Download to user's machine                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Agent Behaviors

### Claude Agent Behavior

**Strengths:**
- Focuses on **test case quality and contextual understanding**
- Excellent at inferring test structure from complex workflows
- Generates comprehensive metadata and descriptions
- Suitable for detailed, nuanced test cases

**Model Selection:**
- **Claude 3.5 Sonnet** - Use for complex workflows requiring high quality
- **Claude 3.5 Haiku** - Use for simple tasks, faster processing

**Example Output:**
```
Test Case ID: TC_001
Test Case Name: User Login with Email Verification
Module / Feature: Authentication
Preconditions: User has registered account with valid email
Test Steps:
  1. Navigate to login page
  2. Enter registered email address in Email field
  3. Enter password in Password field
  4. Click Sign In button
  5. Verify verification code email received
  6. Enter verification code
  7. Click Verify button
Expected Results:
  - User successfully authenticated and redirected to dashboard
  - Session token stored locally
  - User profile loaded correctly
Priority: High
Test Type: Functional
```

### Gemini Agent Behavior

**Strengths:**
- Focuses on **UI text extraction and accuracy**
- Fast response times for time-sensitive workflows
- Emphasizes exact UI element references
- Suitable for high-volume test generation

**Model Selection:**
- **Gemini 2.0 Flash** - Use for fast, cost-effective generation
- **Gemini 3.1 Pro** - Use for advanced reasoning with UI complexity
- **Gemini 3.1 Flash Lite** - Use for lightweight, optimized responses

**Example Output:**
```
Test Case ID: TC_001
Test Case Name: Complete Customer Checkout Flow
Module / Feature: E-Commerce Checkout
Preconditions: User has items in shopping cart
Test Steps:
  1. Click on "View Cart" button in header
  2. Verify "Your Shopping Cart" page is displayed
  3. Verify all items are listed with correct prices
  4. Click on "Proceed to Checkout" button
  5. Verify "Shipping Address" form is displayed
  6. Enter shipping address details
  7. Click on "Continue" button
Expected Results:
  - Shipping address validated
  - Payment method page displayed
  - Order summary shown correctly
Priority: High
Test Type: Workflow
```

### Shared Agent Capabilities

Both agents share these core capabilities:

1. **Multimodal Understanding** - Process text (action logs) + images (screenshots) together
2. **Context Awareness** - Understand workflow flow and UI state transitions
3. **Structured Output** - Follow defined test case format consistently
4. **Autonomous Reasoning** - Infer test structure and validity without user guidance
5. **Error Handling** - Gracefully handle incomplete or ambiguous input
6. **Format Consistency** - Generate output matching QA standards

---

## Data Processing Pipeline

### Input Data Structure

```typescript
{
  actions: [
    {
      id: "uuid-1",
      timestamp: 1716610200000,
      type: "click",
      label: "Mouse Click",
      coordinates: { x: 512, y: 768 },
      screenshotPath: "/temp/screenshot_001.png"
    },
    {
      id: "uuid-2",
      timestamp: 1716610205000,
      type: "key_press",
      label: "Key Press",
      keyCombo: "13"  // Enter key
    }
  ],
  screenshots: [
    "base64_encoded_image_data_1",
    "base64_encoded_image_data_2"
  ],
  selectedModel: "claude-3-5-sonnet-20241022",
  apiKey: "sk-ant-xxxxx"
}
```

### Processing Steps

1. **Action Aggregation** - Collect related actions into logical sequences
2. **Screenshot Association** - Link screenshots to relevant actions
3. **Context Formatting** - Convert raw data into readable action log
4. **Prompt Engineering** - Combine system instructions + context + screenshots
5. **API Transmission** - Send multimodal content to AI service
6. **Response Parsing** - Extract text from API response
7. **Format Validation** - Ensure output matches test case structure
8. **Document Generation** - Convert to Word document or text file

### Output Data Structure

```
Test Case ID: TC_[number]
Test Case Name: [Inferred from workflow]
Module / Feature: [Identified feature area]
Preconditions: 
  - [Condition 1]
  - [Condition 2]
Test Steps:
  1. [Step with exact UI text]
  2. [Step with exact UI text]
  3. [Step with exact UI text]
Expected Results:
  - [Verifiable outcome 1]
  - [Verifiable outcome 2]
Priority: [High / Medium / Low]
Test Type: [Functional / UI / Navigation / Regression / Workflow]
```

---

## Error Handling & Resilience

### Common Error Scenarios

| **Scenario** | **Handling** |
|---|---|
| Missing API Key | Throws error with helpful message before API call |
| Empty Action Set | Validates minimum action count before processing |
| Invalid Screenshots | Filters out empty/invalid base64 data |
| API Timeout | Respects max_tokens limit; client handles timeout |
| Empty AI Response | Validates response content before returning |
| Invalid Model Name | IPC handler checks against supported models |
| File Read Failure | Path validation prevents directory traversal |

### Validation Chain

```
Renderer Input Validation
    ↓
IPC Channel Verification
    ↓
API Key Presence Check
    ↓
Action Array Validation
    ↓
Screenshot Processing
    ↓
Model Name Verification
    ↓
API Call Execution
    ↓
Response Parsing
    ↓
Output Format Validation
    ↓
Document Generation
```

---

## Architecture Advantages

1. **Separation of Concerns** - Recording, AI, Export are independent layers
2. **Provider Flexibility** - Easily swap or add new AI providers
3. **Security** - IPC isolation prevents renderer access to API keys
4. **Performance** - Native hooks for efficient action capture
5. **Scalability** - Modular service design supports future enhancements
6. **Testability** - Each service can be tested independently
7. **User Control** - User selects preferred AI model and export format

---

## Summary

TestForge transforms AI-powered APIs into **functional AI agents** by:

1. **Structuring inputs** systematically through system-level event capture
2. **Providing domain expertise** through carefully crafted system prompts
3. **Orchestrating** API calls through secure IPC channels
4. **Processing outputs** into professional, standards-compliant deliverables
5. **Maintaining context** through the entire workflow pipeline

The agents act autonomously within their defined scope—analyzing user interactions and generating structured test documentation without human intervention during the generation phase. The modular architecture enables easy extension with new AI providers while maintaining clean separation between the UI, native functionality, and AI services.
