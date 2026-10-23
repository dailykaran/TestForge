# TestForge Architecture

## 1. High-Level Architecture

TestForge is an Electron desktop application built with a native main process and a React renderer process. It is designed to capture desktop user interactions, take screenshots, and generate QA test cases using AI.

### Main Components

- **Electron Main Process** (`electron/main.ts`)  
  Handles app lifecycle, native OS integration, IPC setup, and window creation.

- **Preload Script** (`electron/preload.ts`)  
  Exposes secure IPC methods to the renderer while maintaining context isolation.

- **Renderer Process** (`src/`)  
  React UI that provides the dashboard, recording controls, review flow, and settings.

- **Action Capture** (`electron/actionObserver.ts`)  
  Monitors system-level input events such as clicks, key presses, scrolls, and navigation.

- **Screenshot Capture** (`electron/screenshotCapture.ts`)  
  Captures screenshots during recording for visual test documentation.

- **IPC Handlers** (`electron/ipcHandlers.ts`)  
  Manages communication between main and renderer processes.

- **AI Services** (`src/services/claudeService.ts`, `src/services/geminiService.ts`)  
  Integrates with Claude and Gemini APIs for test case generation.

- **Export Service** (`src/services/exportService.ts`)  
  Generates `.docx` test case documents.

- **State Management** (`src/store/useAppStore.ts`)  
  Stores recording data, user settings (default model, judge model, RAG toggle), and generated test cases.

- **LangGraph Workflow** (`electron/graph/`)  
  `state.ts` (graph state and Zod test case schema), `models.ts` (Claude/Gemini chat model factory), `nodes.ts` (normalize, retrieve, generate, validate), and `index.ts` (graph builder with a three-pass refinement loop).

- **RAG Layer** (`electron/rag/`)  
  `lancedbRetriever.ts` (LanceDB `knowledge_base` table), `embeddings.ts` (Gemini `gemini-embedding-001`), `ingest.ts` (chunking and approved-case ingestion), and `retriever.ts` (interface).

- **`testforgeAI` Bridge** (`electron/preload.ts`, `src/ipc.d.ts`)  
  Renderer API for graph generation and progress, knowledge-base management, and context prompt management.

## 2. Architecture Layers

### Desktop / Native Layer

- Uses Electron to run a desktop app with access to native OS capabilities.
- Captures user interaction events at the system level through `uiohook-napi`.
- Takes screenshots with `screenshot-desktop`.
- Stores configuration and API keys locally using secure mechanisms.

### IPC Communication Layer

- The main process and renderer communicate via Electron IPC channels.
- The preload script exposes specific APIs while preventing direct access to Node.js from the renderer.
- IPC channels coordinate recording start/stop, action data transfer, screenshot operations, and test generation requests.
- Branch additions: `testcases:generate` (graph run), `testcases:progress` (node progress events), `kb:addFiles`, `kb:count`, `kb:clear`, `kb:ingest-approved`, and `context-prompt:get|upload|clear`, exposed to the renderer as `window.testforgeAI`.

### Renderer / UI Layer

- React pages render the application workflow: Dashboard, Recording Setup, Recording, Review, Settings.
- UI interacts with the main process indirectly through secure IPC.
- User preferences and recorded actions are managed in a centralized Zustand store.

### AI Processing Layer

- Recorded actions and metadata are sent to AI services for analysis.
- Claude and Gemini service implementations format requests, handle responses, and return structured test case outputs.
- AI output is mapped into QA document structure with steps, preconditions, expected results, priorities, and metadata.
- **Two generation paths:**
  - **LangGraph path** (used when RAG is enabled): `normalize → retrieve → generate → validate`. The judge model can send critique back to `generate`, with at most three generation passes. Output is schema-validated and separates `setupSteps`, `actionSteps`, and `cleanupSteps`.
  - **Legacy path** (RAG disabled, or fallback if the graph fails): direct Claude/Gemini handlers over the `generate-test-cases` channel returning text.

### Knowledge Base (RAG) Layer

- Documents (`.md`, `.txt`, `.json`) are split into 800-character chunks with 120 overlap, embedded with Gemini, and stored in LanceDB under `app.getPath('userData')/kb`.
- Retrieval returns the top six chunks for the normalized action steps; retrieval failures are logged and generation continues without context.
- Approved generated cases can be ingested back into the knowledge base.
- A Gemini API key is required for embeddings, even when Claude generates.

### Export Layer

- The export service converts generated test cases into Word documents (`.docx`).
- Exports may include text, structured tables, and screenshot references.

## 3. Data Flow

1. **User starts app**  
   Electron main process initializes renderer window and preload script.

2. **Settings configured**  
   User enters API keys, selects the default generation and judge models, toggles the knowledge base, and optionally adds documents or uploads a context prompt.

3. **Recording begins**  
   The renderer requests recording start via IPC.

4. **Action capture**  
   `actionObserver.ts` listens for clicks, typing, scrolling, and navigation events.

5. **Screenshot capture**  
   On relevant actions, `screenshotCapture.ts` captures screenshots and stores them with action metadata.

6. **Recording stops**  
   Renderer notifies main process to stop capturing.

7. **Review and generate**  
   Recorded actions are displayed in the Review page. User requests AI generation.

8. **AI analysis**  
   With RAG enabled, `testcases:generate` builds the LangGraph workflow in the main process (normalize, retrieve, generate, validate) and streams node progress to the Review page. Otherwise (or if the graph fails) `claudeApiHandler.ts`/`geminiApiHandler.ts` handle the legacy `generate-test-cases` request.

9. **Test case creation**  
   Graph results are structured test case objects stored in the renderer; legacy results are text. The user may approve structured cases to ingest them into the knowledge base.

10. **Export**  
   `exportService.ts` writes a `.docx` file based on the generated test cases.

## 4. Key Files and Responsibilities

- `electron/main.ts`: app lifecycle, window management, app menus
- `electron/preload.ts`: safe IPC API exposure
- `electron/ipcHandlers.ts`: channel definitions and request handlers, including graph generation, knowledge-base, and context prompt handlers
- `electron/graph/*`: LangGraph state, model factory, nodes, and graph builder
- `electron/rag/*`: LanceDB retriever, embeddings, and ingestion
- `electron/actionObserver.ts`: user event capture logic
- `electron/screenshotCapture.ts`: screenshot generation and storage
- `src/App.tsx`: main renderer app component
- `src/pages/Dashboard.tsx`: entry point and session controls
- `src/pages/RecordingSetup.tsx`: recording configuration UI
- `src/pages/Recording.tsx`: live recording interface
- `src/pages/Review.tsx`: review, graph/legacy generation flow, progress display, and approved-case ingestion
- `src/pages/Settings.tsx`: API keys, generation and judge model selection, RAG toggle, knowledge base and context prompt management
- `src/services/claudeService.ts`: Claude API integration
- `src/services/geminiService.ts`: Gemini API integration
- `src/services/exportService.ts`: document export generation
- `src/store/useAppStore.ts`: app state management

## 5. Technical Considerations

- **Context Isolation**: The preload script isolates renderer access from Node APIs.
- **Secure IPC**: Only allowed IPC methods are exposed to the renderer.
- **Local Data Handling**: API keys are stored locally and not synced to external services by default.
- **Cross-platform Compatibility**: Electron enables support for Windows, macOS, and Linux.
- **Extensibility**: Architecture supports adding new AI providers and export formats.

## 6. Deployment and Build

- Build process uses Vite for renderer bundling and TypeScript compilation.
- Electron Builder likely packages the app into desktop installers; `electron-builder.config.js` unpacks `@lancedb` and `apache-arrow` from the asar so the native LanceDB modules load in packaged builds.
- Scripts available in `package.json`:
  - `npm run dev`
  - `npm run build`
  - `npm run preview`
  - `npm run lint`

## 7. Diagram (Logical View)

```
[User] --> [React UI Renderer]
          | request | report |
          v         v
      [Electron IPC] <--> [Electron Main Process]
                           | captures   captures |
                           v             v
                [Action Observer]    [Screenshot Capture]
                           | action data + images |
                           v                      v
                     [Zustand Store] <--> [Review UI]
                           |
                           v
                     [AI Service Layer]
                 /          |            \
   [Claude Service]  [Gemini Service]  [LangGraph (RAG on)]
                                        normalize -> retrieve -> generate -> validate
                                                        |              ^ (max 3 passes)
                                               [LanceDB KB + Gemini embeddings]
                           |
                           v
                      [Generated Test Cases]
                           |
                           v
                      [Export Service]
                           |
                           v
                       [.docx Output]
```

## 8. Summary

TestForge architecture is a classic Electron split between native and renderer processes, with a strong focus on secure IPC, AI integration, and export workflows. The `feature/langgraph_RAG` branch adds an optional LangGraph workflow with a judge model and a local LanceDB knowledge base while keeping the direct generators as the default and fallback path. The design separates capture, UI, AI, retrieval, and export concerns, making it easier to extend the product with new providers or formats.
