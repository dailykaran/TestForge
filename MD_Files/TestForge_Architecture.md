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
  Stores recording data, user settings, and generated test cases.

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

### Renderer / UI Layer

- React pages render the application workflow: Dashboard, Recording Setup, Recording, Review, Settings.
- UI interacts with the main process indirectly through secure IPC.
- User preferences and recorded actions are managed in a centralized Zustand store.

### AI Processing Layer

- Recorded actions and metadata are sent to AI services for analysis.
- Claude and Gemini service implementations format requests, handle responses, and return structured test case outputs.
- AI output is mapped into QA document structure with steps, preconditions, expected results, priorities, and metadata.

### Export Layer

- The export service converts generated test cases into Word documents (`.docx`).
- Exports may include text, structured tables, and screenshot references.

## 3. Data Flow

1. **User starts app**  
   Electron main process initializes renderer window and preload script.

2. **Settings configured**  
   User enters API keys and selects AI model in the Settings page.

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
   `claudeService.ts` or `geminiService.ts` sends action data to the selected AI provider.

9. **Test case creation**  
   AI response is parsed into structured test cases in the renderer store.

10. **Export**  
   `exportService.ts` writes a `.docx` file based on the generated test cases.

## 4. Key Files and Responsibilities

- `electron/main.ts`: app lifecycle, window management, app menus
- `electron/preload.ts`: safe IPC API exposure
- `electron/ipcHandlers.ts`: channel definitions and request handlers
- `electron/actionObserver.ts`: user event capture logic
- `electron/screenshotCapture.ts`: screenshot generation and storage
- `src/App.tsx`: main renderer app component
- `src/pages/Dashboard.tsx`: entry point and session controls
- `src/pages/RecordingSetup.tsx`: recording configuration UI
- `src/pages/Recording.tsx`: live recording interface
- `src/pages/Review.tsx`: review and AI generation flow
- `src/pages/Settings.tsx`: API key and model configuration UI
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
- Electron Builder likely packages the app into desktop installers.
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
                 /                     \
        [Claude Service]         [Gemini Service]
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

TestForge architecture is a classic Electron split between native and renderer processes, with a strong focus on secure IPC, AI integration, and export workflows. The design separates capture, UI, AI, and export concerns, making it easier to extend the product with new providers or formats.
