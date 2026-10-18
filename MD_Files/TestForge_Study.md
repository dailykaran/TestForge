# TestForge Product Study

## 1. Product Summary

**TestForge** is a desktop application for automating the capture of user interactions and generating professional QA test cases using AI. It is built with Electron and React, and it integrates with Claude or Gemini APIs to transform recorded user actions into structured test documentation.

### Core value proposition
- Automatically captures desktop user actions
- Generates QA test cases with AI assistance
- Produces exportable Word documents for sharing with QA and development teams
- Helps speed up test documentation and improve consistency

## 2. Key Features

- **Real-time interaction recording**: monitors clicks, keyboard input, scrolling, navigation, and other desktop actions
- **Screenshot capture**: automatically takes screenshots during test execution for visual evidence
- **AI-powered analysis**: uses Anthropic Claude or Google Gemini to generate test case descriptions and structure
- **Export to .docx**: generates Word documents containing test cases and step definitions
- **Configurable AI models**: supports multiple AI provider options and model selections
- **Local API key handling**: stores API keys locally in a privacy-friendly way
- **LangGraph generation workflow** (`feature/langgraph_RAG`): normalize → retrieve → generate → validate, with up to three judge-driven refinement passes
- **RAG knowledge base**: local LanceDB store (Gemini `gemini-embedding-001` embeddings) fed by `.md`/`.txt`/`.json` documents and approved test cases
- **Separate judge model**: a second model reviews generated cases and returns critique
- **Structured test cases**: `setupSteps`, `actionSteps` (with explicit "Verify that..." steps), `cleanupSteps`, and `expectedResult`
- **Context prompt upload and test case summary**: a user-supplied `.md`/`.txt` prompt (max 100 KB) and a short summary (truncated to 2000 characters) guide generation
- **Progress reporting**: the Review page shows the active graph node while generating

## 3. Supported Workflows

1. Configure API keys, a default generation model, and a judge model in the settings page
2. Optionally enable the knowledge base (RAG), add reference documents, and upload a context prompt
3. Start a new recording session from the dashboard
4. Perform actions in the selected screen/window while the recorder captures interaction events
5. Stop recording and review captured actions on the Review page
6. Generate AI-based test cases (LangGraph path when RAG is enabled; legacy direct generator otherwise or on graph failure)
7. Optionally approve generated cases so they are added to the knowledge base
8. Export the generated test cases as a Word document

## 4. Architecture Overview

### Technology stack
- **Electron**: desktop application platform
- **React 19 + TypeScript**: renderer UI
- **Vite**: build and development tooling
- **Tailwind CSS**: utility-first styling
- **Zustand**: application state management
- **uiohook-napi**: native user interaction tracking
- **screenshot-desktop**: screenshot capture
- **docx**: Word document generation
- **LangGraph / LangChain**: `@langchain/langgraph`, `@langchain/core`, `@langchain/anthropic`, `@langchain/google-genai`
- **LanceDB + Apache Arrow**: local vector store for the knowledge base
- **@langchain/textsplitters**: document chunking (800 characters, 120 overlap)
- **zod**: structured test case schema

### Main functional layers
- `electron/`: native desktop and system interaction layer
  - `main.ts`: Electron startup and app lifecycle
  - `ipcHandlers.ts`: secure renderer/main communication
  - `actionObserver.ts`: capture of user interactions
  - `screenshotCapture.ts`: screenshot creation
  - `preload.ts`: preload script for secure IPC access (also exposes the `testforgeAI` bridge)
  - `graph/`: LangGraph state, model factory, nodes, and graph builder
  - `rag/`: LanceDB retriever, Gemini embeddings, and document/approved-case ingestion
- `src/`: renderer application
  - `src/pages/`: user-facing screens such as Dashboard, Recording, Review, Settings
  - `src/services/`: AI and export services
  - `src/store/`: global state store
  - `src/App.tsx`: application shell

## 5. AI Model Support

### Claude (Anthropic)
- `Claude 3.5 Sonnet` for high-quality output
- `Claude 3.5 Haiku` for faster and lighter processing
- Suitable when test case quality and contextual understanding are a priority

### Gemini (Google)
- `Gemini 2.5 Flash` (recommended default), `Gemini 3.5 Flash`, `Gemini 3.5 Flash Lite`, `Gemini 3.8 Flash`, `Gemini 3.1 Flash Lite`, and `Gemini 2.5 Flash Lite` for fast, cost-effective responses
- `Gemini 3.1 Pro Preview` for advanced reasoning
- `Gemini 4 Argon` (`gemini-4-argon`), available as a generation and judge model
- The older Gemini 1.5 and 2.0 entries were removed from the Default Generation Model list
- Suitable for teams that need high volume and fast response

### Model roles
- **Default Generation Model** writes the test cases.
- **Judge Model** (LangGraph path) reviews them; it may be a different provider than the generator.
- A Gemini API key is always required for knowledge-base embeddings, even when Claude generates.

## 6. Installation and Development

### Requirements
- Node.js 18+
- npm 9+
- Desktop OS: Windows, macOS, or Linux

### Common commands
- `npm install` — install dependencies
- `npm run dev` — start development server
- `npm run build` — build production app
- `npm run preview` — preview production build
- `npm run lint` — run ESLint checks

## 7. Product Strengths

- Great fit for QA teams and automation engineers who need structured test case output
- Reduces manual effort in test documentation
- Combines visual documentation with AI-generated narrative
- Supports multiple AI providers to avoid vendor lock-in

## 8. Notes for Users

- API keys are required for AI-powered generation
- The recorder is designed for desktop applications and local screen capture
- Export format is currently `.docx` (plus `.txt`), making it easy to share with stakeholders
- The knowledge base lives under Electron's `userData/kb` directory and persists between sessions; uploaded context prompts are stored in `context-detail-prompt.json` in the same location
- The LangGraph path currently builds its prompt from action text, retrieved context, summary, and context prompt; screenshots are passed in the request but not sent to the model on this path

## 9. File and Project Summary

- `package.json` shows Electron app dependencies and scripts
- `electron/` contains native desktop logic, recording, screenshot, and IPC
- `src/` contains the React-based UI, AI services, and state management
- `vite.config.ts` and `tsconfig.json` support the build configuration
- `electron/graph/` and `electron/rag/` hold the LangGraph and RAG implementation
- `MD_Files/` is the designated documentation folder; see `LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md` and `TestForge_LangGraph_Feature_Study.md` for the branch details
