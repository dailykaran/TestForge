# LangGraph and RAG Branch Implementation

This document describes the implementation on `feature/langgraph_RAG`, relative to `master`. It focuses on behavior present in the application code rather than proposed or optional approaches.

## Branch summary

This branch adds an optional LangGraph-based test case generation workflow, a persistent local retrieval knowledge base, controls for model and prompt selection, and a path for adding approved generated cases back to the knowledge base.

The feature branch commits are:

- `880f1c4` — added the RAG system.
- `f244410` — fixed RAG integration and added the uploaded text-prompt flow.
- `b95fafe` — added the LangGraph feature study.

The implementation adds graph and RAG modules under `electron/`, connects them to the renderer through Electron IPC and the preload bridge, and adds settings and review-screen controls. See [README.md](../README.md) for the application overview and setup.

## User-visible changes

### Model and generation settings

The Settings screen provides:

- A default model for generation.
- A separate judge model for the LangGraph workflow.
- A toggle to enable or disable the knowledge-base/LangGraph flow.
- Knowledge-base document add, count, and clear controls.
- Upload and removal controls for an optional context prompt.

The selected generation model and judge model, along with the RAG toggle, are persisted using Zustand. Provider selection is inferred from the model ID prefix: `claude-` selects Anthropic; other configured model IDs select Gemini.

### Review and approval

When RAG mode is enabled, the Review screen streams graph node progress, displays structured generated cases, and offers the ability to add approved cases to the knowledge base. Generated cases are also rendered into the existing review/export representation.

When RAG mode is disabled, the Review screen invokes the existing direct-generation IPC route. If the graph generation call fails, the UI reports the reason and attempts the legacy generator as a fallback.

## LangGraph generation flow

The graph is built in [`electron/graph/index.ts`](../electron/graph/index.ts) and runs in the Electron main process:

```text
START
  -> normalize recorded actions
  -> retrieve reference context (or use no context if retrieval is disabled/fails)
  -> generate structured test cases
  -> validate with the judge model
       -> regenerate with critique, up to three generation passes
       -> END when accepted or the pass limit is reached
```

### Graph state and output schema

[`electron/graph/state.ts`](../electron/graph/state.ts) defines state for recorded actions, screenshots, the normalized textual query, retrieved context, generated cases, judge critique, and iteration count.

Each generated case is validated against a Zod schema with:

- `id`, `title`, `priority`, and `type`
- `preconditions`
- Separate `setupSteps`, `actionSteps`, and `cleanupSteps`
- `expectedResult`

The generation instructions require ordered, explicit verification steps after important state changes. They also direct the model not to invent interface elements or outcomes and to use recorded action wording.

### Graph nodes and retry behavior

[`electron/graph/nodes.ts`](../electron/graph/nodes.ts) implements the nodes:

1. **Normalize:** turns each recorded event into a numbered text line using its type and available label, target, value, key combination, URL, or element hint.
2. **Retrieve:** searches the knowledge base for up to six matching text chunks. Retrieval errors are logged and the graph continues with an empty context.
3. **Generate:** requests structured test cases from the generation model. If there is judge feedback from a previous pass, that critique is included in the next request.
4. **Validate:** asks the judge model for a structured pass/critique result. A passing result clears the critique; a failing result returns feedback to the generation node.

The graph allows a maximum of three generation passes. It ends earlier if the judge accepts the cases.

## Retrieval knowledge base

The retrieval implementation is in [`electron/rag/`](../electron/rag/):

- [`lancedbRetriever.ts`](../electron/rag/lancedbRetriever.ts) stores vectors and text in a LanceDB table named `knowledge_base`.
- [`embeddings.ts`](../electron/rag/embeddings.ts) uses Gemini's `gemini-embedding-001` embedding model.
- [`ingest.ts`](../electron/rag/ingest.ts) splits imported documents into chunks of 800 characters with 120 characters of overlap. Supported file types are Markdown (`.md`), text (`.txt`), and JSON (`.json`).
- [`retriever.ts`](../electron/rag/retriever.ts) defines the shared ingestion/search/count interface.

The LanceDB database is kept under `app.getPath('userData')/kb`. `electron/main.ts` overrides `userData`: in development it is `%TEMP%\TestForge-electron` (so the knowledge base is at `%TEMP%\TestForge-electron\kb`), and when `NODE_ENV=production` it is `<cwd>\.app-data`. It persists across application sessions but can be removed by temp-folder cleanup in development. See [TestForge_RAG_Implementation.md](./TestForge_RAG_Implementation.md) for full details. Imported chunks retain source metadata; approved test cases are ingested as JSON text with a feature label. Search returns the text of the nearest chunks for use as generation context.

Gemini credentials are required for embedding operations and therefore for the knowledge base, even when Claude is chosen as the generation or judge model. Retrieval errors during an already-started graph run are logged and result in generation without retrieved context.

## Uploaded context prompt

Settings allows one `.md` or `.txt` prompt file to be uploaded. The main process reads the file and stores its content and original filename in `context-detail-prompt.json` under Electron's user data directory. Empty files and files larger than 100 KB are rejected. The prompt content is appended to the graph generation instructions when uploaded-prompt mode is selected. Users can inspect the stored filename or remove the uploaded prompt from Settings.

## Electron IPC and process boundary

The renderer accesses the feature through the `testforgeAI` API exposed in [`electron/preload.ts`](../electron/preload.ts), with matching renderer declarations in [`src/ipc.d.ts`](../src/ipc.d.ts). The API provides:

- Graph generation and progress subscription.
- Knowledge-base import, count, clear, and approved-case ingestion.
- Uploaded context prompt inspection, upload, and removal.

[`electron/ipcHandlers.ts`](../electron/ipcHandlers.ts) constructs the graph and provider models in the main process, reads API keys through the existing key-store functions, streams node progress to the renderer, and returns the final structured cases. API keys are not passed from the renderer to the graph call.

## Dependencies and packaging

The branch adds LangGraph/LangChain integrations, LanceDB, Arrow, document text splitting, and structured-output validation dependencies in `package.json`. The Electron builder configuration unpacks the LanceDB and Apache Arrow native/package assets from the application archive so they can load in the packaged app.

## Current behavior and boundaries

- The LangGraph workflow is selected by the RAG toggle; disabling it selects the direct legacy generator rather than running the graph without retrieval.
- If graph startup or execution fails, the Review screen reports the failure and tries the legacy generator. If that fallback also fails, the error is surfaced in the existing generation error UI.
- Screenshots are carried in the graph request and state, but the graph generation node currently builds its prompt from normalized action text, retrieved text, optional summary, and optional uploaded prompt; it does not add screenshot image data to its model request.
- Approved cases are added only after the user invokes the approval action; merely generating or exporting cases does not automatically ingest them.
- Clearing the knowledge base removes the `knowledge_base` table. It does not remove the separately stored uploaded context prompt.

## Main implementation files

| Area | Files |
|---|---|
| Graph workflow and state | [`electron/graph/index.ts`](../electron/graph/index.ts), [`electron/graph/state.ts`](../electron/graph/state.ts), [`electron/graph/nodes.ts`](../electron/graph/nodes.ts), [`electron/graph/models.ts`](../electron/graph/models.ts) |
| Retrieval and ingestion | [`electron/rag/retriever.ts`](../electron/rag/retriever.ts), [`electron/rag/lancedbRetriever.ts`](../electron/rag/lancedbRetriever.ts), [`electron/rag/embeddings.ts`](../electron/rag/embeddings.ts), [`electron/rag/ingest.ts`](../electron/rag/ingest.ts) |
| Main-process IPC and bridge | [`electron/ipcHandlers.ts`](../electron/ipcHandlers.ts), [`electron/preload.ts`](../electron/preload.ts), [`src/ipc.d.ts`](../src/ipc.d.ts) |
| Renderer and preferences | [`src/pages/Settings.tsx`](../src/pages/Settings.tsx), [`src/pages/Review.tsx`](../src/pages/Review.tsx), [`src/store/useAppStore.ts`](../src/store/useAppStore.ts) |
