# TestForge Detailed Product Study

## 1. Product Overview

TestForge is an Electron-based desktop application that records user interactions and transforms those interactions into professional QA test cases using AI. It is intended for QA engineers, automation testers, and developers who need to speed up test documentation while preserving precision.

### Purpose
- Capture user workflows on desktop applications and web applications running in a desktop context.
- Collect interaction metadata and screenshots automatically.
- Use AI to generate structured test case documents from recorded sessions.

### Value proposition
- Reduces manual writing of test cases
- Provides consistent, professional documentation
- Bridges manual exploratory testing with structured test artifacts
- Supports multiple AI providers for flexibility and resilience

## 2. Product Goals

- Deliver a seamless recording experience for desktop workflows
- Produce QA test cases with clear steps, preconditions, and expected results
- Make AI model selection simple and user-configurable
- Create export-ready documentation in `.docx` format
- Keep sensitive data local and avoid unnecessary cloud persistence

## 3. User Personas

### QA Engineer
- Wants to turn exploratory sessions into reusable test cases
- Needs visual evidence for steps and expected results
- Prefers an export format compatible with test management tools

### Test Automation Engineer
- Uses recorded steps to derive automation scripts or manual test suites
- Needs consistent action descriptions and precondition clarity
- Wants to minimize rework after manual test sessions

### Product Manager / Stakeholder
- Wants to review testing coverage and ensure documentation quality
- Uses exported `.docx` artifacts for reporting and approvals

## 4. Primary Use Cases

- Recording and documenting end-to-end desktop application workflows
- Generating regression test cases from manual exploratory sessions
- Capturing UI navigation, input flows, and expected behavior
- Exporting AI-designed test cases to share with non-technical stakeholders

## 5. Feature Breakdown

### Interaction Recording
- Detects user actions such as clicks, keyboard input, scroll events, navigation, and selection changes
- Collects detailed metadata for each event
- Supports pause/resume of recording sessions

### Screenshot Capture
- Records screenshots on click actions or key events for visual context
- Attaches screenshot references to recorded steps for proof

### AI-Based Test Case Generation
- Uses two AI providers: Anthropic Claude and Google Gemini
- Integrates with provider-specific SDKs
- Formats recorded actions into test case structure, including:
  - Test Case ID
  - Test Case name
  - Preconditions
  - Step-by-step instructions
  - Expected results
  - Priority classification
  - Test type classification

### LangGraph and RAG Generation (`feature/langgraph_RAG`)
- When the knowledge base (RAG) toggle is on, generation runs a LangGraph workflow in the main process: normalize recorded actions → retrieve reference context → generate → validate with a judge model
- The judge can return critique, triggering regeneration; at most three generation passes run
- Output is a Zod-validated structure: `id`, `title`, `priority`, `type`, `preconditions`, `setupSteps`, `actionSteps` (with separate "Verify that..." steps), `cleanupSteps`, `expectedResult`
- The generator is instructed to follow recorded action wording and not to invent UI elements or outcomes
- A separate **Judge Model** can be chosen, including a different provider than the generator
- If the graph fails, the Review page reports the reason and falls back to the legacy generator

### Knowledge Base
- Local LanceDB table `knowledge_base` under `userData/kb`, embedded with Gemini `gemini-embedding-001`
- Add `.md`, `.txt`, or `.json` documents (800-character chunks, 120 overlap), view the indexed chunk count, or clear the base
- Top six matching chunks are supplied as reference context
- Approved generated cases can be ingested for future retrieval

### Context Prompt and Summary
- Upload one `.md`/`.txt` context prompt (≤ 100 KB), stored as `context-detail-prompt.json`; appended to generation instructions in uploaded-prompt mode
- An optional test case summary (truncated to 2000 characters) describes intent only; recorded actions remain authoritative

### Export Capability
- Produces `.docx` documents using the `docx` library
- Includes sections for test case metadata, steps, and screenshots
- Provides a shareable format for QA reports and documentation

### Settings and Configuration
- Allows entry of API keys for Claude and Gemini
- Supports model selection and provider switching for both the default generation model and the judge model
- Model lists: Gemini 2.5 Flash (recommended), 3.5 Flash, 3.5 Flash Lite, 3.8 Flash, 3.1 Pro Preview, 3.1 Flash Lite, 2.5 Flash Lite, and Gemini 4 Argon (`gemini-4-argon`); Claude 3.5 Sonnet and Haiku. The "Google - Older" group (Gemini 1.5/2.0) was removed from the generation list
- RAG toggle, knowledge-base management, and context prompt upload
- Persists `defaultModel`, `judgeModel`, and `useRag` locally
- Maintains settings in local storage or secure local store

## 6. Technical Architecture

TestForge uses a split architecture common to Electron apps:
- **Main process** handles OS-level functionality, action capture, screenshots, and IPC.
- **Renderer process** handles the React user interface and state management.
- **Preload script** exposes safe IPC functions to the renderer.

### Main Process Responsibilities
- Manage application lifecycle and create renderer windows
- Initialize native modules and secure IPC channels
- Capture user interactions with `uiohook-napi`
- Capture screenshots using `screenshot-desktop`
- Execute export and file system operations

### Renderer Process Responsibilities
- Render UI pages with React and Tailwind CSS
- Manage application state with Zustand
- Display recording status, captured actions, and AI-generated results
- Collect user input for settings and export operations

### IPC and Data Flow
- Renderer sends commands to start/stop recording, request AI generation, or export results
- Main process sends recorded action data back to renderer for review
- Preload enforces a safe API contract for all IPC interactions

## 7. Important Components and Files

### Electron Layer
- `electron/main.ts`: app startup, window creation, and main IPC registration
- `electron/preload.ts`: secure IPC bridge for renderer access
- `electron/ipcHandlers.ts`: request routing and response handling between renderer and main
- `electron/actionObserver.ts`: tracks and normalizes native user events
- `electron/screenshotCapture.ts`: takes and stores screenshots on demand
- `electron/pathValidator.ts`: validates file paths for saving exports or screenshots
- `electron/graph/`: `state.ts`, `models.ts`, `nodes.ts`, `index.ts` — LangGraph workflow
- `electron/rag/`: `lancedbRetriever.ts`, `embeddings.ts`, `ingest.ts`, `retriever.ts` — knowledge base

### Renderer Layer
- `src/App.tsx`: root application component and routing
- `src/pages/Dashboard.tsx`: entry point for new recordings and sessions
- `src/pages/RecordingSetup.tsx`: configuration for recording targets and options
- `src/pages/Recording.tsx`: live recording interface and status
- `src/pages/Review.tsx`: review captured actions and generate AI test cases
- `src/pages/Settings.tsx`: API key and model settings UI

### Service Layer
- `src/services/claudeService.ts`: Claude AI service integration
- `src/services/geminiService.ts`: Gemini AI service integration
- `src/services/exportService.ts`: `.docx` export generation
- `src/store/useAppStore.ts`: shared state for recordings, settings, and generated output

### Support Files
- `package.json`: dependencies, scripts, and Electron main entry
- `vite.config.ts`: renderer build config
- `tsconfig.json`: TypeScript configuration
- `tailwind.config.js`: Tailwind styling config

## 8. AI Integration Details

### Claude Service
- Uses `@anthropic-ai/sdk`
- Handles prompts and structured output from Claude models
- Ideal for high-quality reasoning and detailed test case generation

### Gemini Service
- Uses `@google/genai`
- Provides fast, cost-efficient AI generation
- Offers a strong fallback or alternative provider for model diversity

### Output Expectations
- Generated test cases should follow QA best practices
- Includes atomic steps and expected outcomes
- Provides a unified format that can be exported without manual re-editing

### LangGraph Integration
- Uses `@langchain/langgraph`, `@langchain/anthropic`, and `@langchain/google-genai` (`electron/graph/models.ts` builds the chat model with temperature 0.2)
- Provider is inferred from the model ID prefix (`claude-` → Claude, otherwise Gemini)
- Keys are read from the keychain in the main process; the renderer never sends them

## 9. Development and Build Requirements

### Required tools
- Node.js 18+ installed
- npm 9+ installed
- Electron-compatible desktop platform

### Installation steps
1. Clone repository
2. Run `npm install`
3. Start development server with `npm run dev`

### Build workflow
- `npm run build` compiles TypeScript and bundles renderer assets
- `npm run preview` previews a production build
- `npm run lint` validates code quality

## 10. Recommended Improvement Areas

- Add support for additional export formats such as Markdown, PDF, or JSON
- Support more AI providers or local LLM models
- Add deeper action categorization for test case optimization
- Improve screenshot annotation and inline screenshot insertion in exports
- Add support for automated script generation from test cases

## 11. Potential Limitations

- AI output quality depends on the selected model and provider
- Desktop action capture may vary across OS environments
- `.docx` export may not preserve advanced formatting in all use cases
- Requires valid API keys for AI generation
- Knowledge-base embeddings always need a Gemini API key
- Screenshots are not sent to the model on the LangGraph path
- Graph refinement is capped at three passes, which bounds cost but may end with unresolved critique

## 12. Security Information

- **API keys are stored securely** in the operating system keychain using `keytar`.
  - Windows: Credential Manager
  - macOS: Keychain
  - Linux: Secret Service
- **The renderer process does not receive raw API keys.** The app only returns boolean status for whether a key exists, and all key access is handled in the main process.
- **IPC is restricted with an allowlist** in `electron/preload.ts`.
  - Only explicitly permitted channels can be invoked or listened to from the renderer.
  - Unauthorized channels are blocked and logged.
- **File operations are validated before execution.** The app uses `electron/pathValidator.ts` to:
  - normalize and resolve file paths
  - enforce that read/write operations remain inside the app's safe temp directory
  - prevent directory traversal and unauthorized access
- **Temporary recording data is sandboxed.** Screenshots, videos, and exported session artifacts are stored in `app.getPath('temp')/testforge` and are only accessible through validated app flows.
- **AI generation occurs in the main process.** Recorded action data and screenshots are forwarded securely through provider SDKs from the main process, reducing risk exposure in the renderer.
- **Knowledge-base and prompt data stay local.** The LanceDB store and uploaded context prompt live under Electron's `userData` directory. Document text is sent to Gemini for embedding, and retrieved chunks are sent to the selected generation and judge models. Prompt uploads are limited to 100 KB and `testcases:generate` summaries to 2000 characters.
- **The `testforgeAI` bridge exposes only specific methods** rather than arbitrary IPC channels.
- **Session data is transient.** In-browser `sessionStorage` is used only for session timing and does not persist test case or action data beyond the active app session.
- **User control for sensitive data.** Users can clear stored API keys at any time, and the app is designed to keep sensitive configuration local rather than synced to external storage.
- **Recommended security practices**
  - Keep the OS and Electron environment patched
  - Do not share exported `.docx` files containing sensitive information unless necessary
  - Clear API keys when the app is no longer in use
  - Use the app on trusted machines only

## 13. Summary

TestForge is a comprehensive desktop QA tooling solution that tightly integrates native recording, screenshot capture, and AI-driven test generation. Its architecture separates native capture from UI logic, enabling stable recording workflows and extensible AI/export pipelines.
