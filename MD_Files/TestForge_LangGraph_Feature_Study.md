# TestForge - LangGraph Feature Branch Study

> See also: [LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md](./LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md) for a concise implementation reference.

## 1. Executive Summary

TestForge is an intelligent Electron desktop application that records user interactions and leverages AI to generate structured QA test cases. The `feature/langgraph_RAG` branch introduces a LangGraph-based agentic workflow for test case generation, enhanced RAG (Retrieval-Augmented Generation) capabilities, and a knowledge base system to improve generation quality through iterative refinement.

### Key Enhancements on this Branch
- **LangGraph Orchestration**: Multi-step agent workflow with validation and self-critique loops
- **RAG Integration**: Vector-based knowledge base using LanceDB for domain-specific guidance
- **Context Prompt Upload**: Custom user context files to guide generation
- **Judge Model**: Separate validation model for quality control
- **Enhanced Test Case Schema**: Structured output with setupSteps, actionSteps, cleanupSteps separation
- **Knowledge Base Growth**: Approved test cases are ingested back into the KB for future improvements

## 2. Technology Stack

### Core Framework
- **Electron 42.2.0**: Cross-platform desktop application
- **React 19.2.6** with TypeScript 6.0.3: Renderer UI
- **Vite 8.0.14**: Build tooling and dev server
- **Zustand 5.0.13**: State management with persistence

### AI & LangGraph
- **@langchain/langgraph 1.4.18**: Agent workflow orchestration
- **@langchain/core 1.2.14**: LangChain core abstractions
- **@langchain/anthropic 1.5.12**: Claude integration via LangChain
- **@langchain/google-genai 2.3.2**: Gemini integration via LangChain
- **@anthropic-ai/sdk 0.98.0**: Direct Anthropic API
- **@google/genai 2.6.0**: Direct Google GenAI API
- **zod 4.6.5**: Schema validation and structured outputs

### RAG & Vector Storage
- **@lancedb/lancedb 0.39.0**: Local vector database
- **apache-arrow 18.1.0**: Columnar data processing for LanceDB
- **@langchain/textsplitters 1.0.2**: Document chunking for ingestion

### System Interaction
- **uiohook-napi 1.5.5**: Global mouse/keyboard event capture
- **screenshot-desktop 1.15.4**: Screenshot capture
- **keytar 7.9.0**: Secure OS keychain for API key storage

### Export & Utilities
- **docx 9.6.1**: DOCX document generation
- **uuid 14.0.0**: Unique identifier generation

## 3. LangGraph Architecture

### 3.1 Workflow Overview

The LangGraph implementation (`electron/graph/`) creates an iterative agentic workflow for test case generation. It consists of four nodes with a self-critique loop that can run up to 3 iterations.

```
START → normalize → retrieve (optional) → generate → validate → (loop if critique exists) → END
```

### 3.2 State Definition (`electron/graph/state.ts`)

The graph state tracks the entire generation process:

```typescript
export const GraphState = Annotation.Root({
  actions: Annotation<RecordedAction[]>(),      // Captured user interactions
  screenshots: Annotation<string[]>(),          // Base64 screenshots
  query: Annotation<string>(),                  // Normalized action steps
  context: Annotation<string[]>(),               // Retrieved RAG context chunks
  testCases: Annotation<TestCase[]>(),           // Generated test cases
  critique: Annotation<string>(),                // Validation feedback
  iterations: Annotation<number>(),              // Current iteration count
});
```

### 3.3 Test Case Schema

The structured output schema enforces a clear separation of concerns:

```typescript
export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.enum(["High", "Medium", "Low"]),
  type: z.enum(["Functional", "Negative", "Boundary", "UI"]),
  preconditions: z.array(z.string()),
  setupSteps: z.array(z.string()),               // Environment prep, account creation
  actionSteps: z.array(z.string()),              // Core behavior + explicit Verify steps
  cleanupSteps: z.array(z.string()),             // Teardown, data deletion
  expectedResult: z.string(),
});
```

Key design decisions:
- **Explicit separation**: setup, action, and cleanup steps are in separate arrays
- **Verification enforcement**: `actionSteps` must include separate "Verify that..." steps after important actions
- **Intent vs actions**: User summaries describe intent only; recorded actions must be followed verbatim
- **No invention**: The generator must not invent UI elements or outcomes

### 3.4 Graph Construction (`electron/graph/index.ts`)

```typescript
export function buildGraph(deps: {
  retriever: Retriever;
  generator: BaseChatModel;
  judge: BaseChatModel;
  useRag: boolean;
  contextPrompt?: string;
  testCaseSummary?: string;
}) {
  const g = new StateGraph(GraphState)
    .addNode("normalize", normalizeActions)
    .addNode("retrieve", deps.useRag ? makeRetrieve(deps.retriever) : async () => ({ context: [] }))
    .addNode("generate", makeGenerate(deps.generator, deps.contextPrompt, deps.testCaseSummary))
    .addNode("validate", makeValidate(deps.judge, deps.testCaseSummary))
    .addEdge(START, "normalize")
    .addEdge("normalize", "retrieve")
    .addEdge("retrieve", "generate")
    .addEdge("generate", "validate")
    .addConditionalEdges("validate", (s) =>
      s.critique && s.iterations < MAX_ITERATIONS ? "generate" : END
    );

  return g.compile();
}
```

**MAX_ITERATIONS = 3**: The system iteratively refines test cases based on judge feedback.

### 3.5 Node Implementations

#### normalizeActions (`electron/graph/nodes.ts`)
Converts recorded actions into a textual query:
```typescript
export const normalizeActions = async (s: GraphStateType) => {
  const steps = s.actions.map((a, index) => {
    const detail = a.label || a.target || a.value || a.keyCombo || a.url || a.elementHint;
    return `${index + 1}. ${a.type}${detail ? `: ${detail}` : ""}`;
  });
  return { query: steps.join("\n") };
};
```

#### retrieve (`makeRetrieve`)
Performs semantic search against the knowledge base (if RAG enabled). Falls back gracefully if retrieval fails.

#### generate (`makeGenerate`)
- Uses `llm.withStructuredOutput()` with `TestCaseSchema` for guaranteed JSON structure
- System prompt emphasizes strict adherence to recorded actions
- Enforces separation of setup/action/cleanup
- Requires explicit verification steps after state changes
- Incorporates user context prompt if provided
- Includes test case summary if provided
- On iteration > 0, includes critique feedback

#### validate (`makeValidate`)
Acts as a judge to ensure quality:
1. setup, core actions, cleanup in separate fields
2. All recorded core actions covered and ordered
3. Verifications after submissions, saves, syncs, connections, state changes
4. No invented actions/outcomes
5. Specific expected results

If validation fails (pass=false), returns critique and triggers loop back to generate.

### 3.6 Model Configuration (`electron/graph/models.ts`)

```typescript
export function makeChatModel(provider: Provider, model: string, apiKey: string): BaseChatModel {
  return provider === "claude"
    ? new ChatAnthropic({ model, apiKey, temperature: 0.2, maxTokens: 8192 })
    : new ChatGoogleGenerativeAI({ model, apiKey, temperature: 0.2, maxOutputTokens: 16384 });
}
```

- **Temperature 0.2**: Low temperature for deterministic, consistent test case generation
- **Claude**: maxTokens 8192
- **Gemini**: maxOutputTokens 16384
- **Judge model**: Can be different from generator (configured via Settings)

## 4. RAG & Knowledge Base System

### 4.1 Retriever Interface (`electron/rag/retriever.ts`)

```typescript
export interface KbDoc {
  text: string;
  meta: Record<string, string>;   // e.g. { source: "login-requirements.md", feature: "login" }
}

export interface Retriever {
  ingest(docs: KbDoc[]): Promise<void>;
  search(query: string, k: number): Promise<string[]>;
  count(): Promise<number>;
}
```

### 4.2 LanceDB Implementation (`electron/rag/lancedbRetriever.ts`)

- **Storage location**: `app.getPath('userData')/kb` (persistent across sessions)
- **Table name**: `knowledge_base`
- **Vectorization**: Via Gemini embeddings (`gemini-embedding-001`)
- **Search**: Vector similarity search, returns top `k` (default 6) matching chunks
- **Graceful handling**: Creates table on first ingest, skips if empty

### 4.3 Embeddings (`electron/rag/embeddings.ts`)

```typescript
export function makeEmbeddings(geminiApiKey: string) {
  return new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-001",
    apiKey: geminiApiKey,
  });
}
```

Uses Gemini's embedding model for semantic similarity.

### 4.4 Ingestion (`electron/rag/ingest.ts`)

#### ingestFiles
- Accepts `.md`, `.txt`, `.json` files
- Uses `RecursiveCharacterTextSplitter` (chunkSize: 800, chunkOverlap: 120)
- Extracts filename as source metadata
- Returns count of ingested chunks

#### ingestApprovedCases
- Called after user approves generated test cases
- Converts each case to JSON string
- Tags with `source: "approved-test-case"` and feature name
- Enables continuous learning from reviewed examples

## 5. IPC Layer & API Surface

### 5.1 Legacy IPC (Legacy Path)

Traditional generation path via `generate-test-cases` channel:
```typescript
ipcMain.handle(IPC_CHANNELS['generate-test-cases'], async (_, actionData) => {
  const { actions, screenshots, modelName, promptMode = 'detailed', useUploadedPrompt = false } = data;
  const contextPrompt = useUploadedPrompt ? readContextPrompt()?.content : undefined;
  // Routes to Claude or Gemini handlers based on model name
});
```

### 5.2 New LangGraph IPC (`testcases:generate`)

The generation path used for the knowledge-base / RAG workflow:
```typescript
ipcMain.handle("testcases:generate", async (event, payload) => {
  const provider = payload.provider;
  const judgeProvider = payload.judgeProvider ?? provider;
  const contextPrompt = payload.useUploadedPrompt ? readContextPrompt()?.content : undefined;
  const retriever = payload.useRag ? await getLanceRetriever() : noOpRetriever;
  const graph = buildGraph({ ... });
  const stream = await graph.stream(initialState, { streamMode: ["updates", "values"] });
  // Emits progress via "testcases:progress" channel
  // Returns finalState.testCases
});
```

**Progress events**: Emits node names (`normalize`, `retrieve`, `generate`, `validate`) as they execute.

**Important routing nuance**: In the renderer, the LangGraph path is only invoked when `useRag` is enabled. When RAG is disabled, generation goes through the legacy `generate-test-cases` channel. Additionally, if the LangGraph call throws, the UI catches the error, shows a notice, and **falls back to the legacy generator** automatically. This makes the graph path progressive/opt-in rather than the sole generation route.

### 5.3 Knowledge Base IPC

- `kb:addFiles` - Open file dialog for multi-select `.md/.txt/.json`, ingest to KB
- `kb:count` - Get total indexed documents/chunks
- `kb:clear` - Drop KB table
- `kb:ingest-approved` - Ingest approved test cases with feature tag

### 5.4 Context Prompt IPC

- `context-prompt:get` - Check if uploaded prompt exists, return filename
- `context-prompt:upload` - Open file dialog for `.md/.txt` (max 100KB), save to userData
- `context-prompt:clear` - Remove uploaded prompt

### 5.5 Secure Preload API

The preload script (`electron/preload.ts`) exposes a secure `testforgeAI` API:

```typescript
contextBridge.exposeInMainWorld("testforgeAI", {
  generate: (payload) => ipcRenderer.invoke("testcases:generate", payload),
  onProgress: (cb) => { /* subscribe/unsubscribe */ },
  addKnowledgeFiles: () => ipcRenderer.invoke("kb:addFiles"),
  knowledgeCount: () => ipcRenderer.invoke("kb:count"),
  clearKnowledgeBase: () => ipcRenderer.invoke("kb:clear"),
  ingestApprovedCases: (cases, feature) => ipcRenderer.invoke("kb:ingest-approved", { cases, feature }),
  getContextPromptInfo: () => ipcRenderer.invoke('context-prompt:get'),
  uploadContextPrompt: () => ipcRenderer.invoke('context-prompt:upload'),
  clearContextPrompt: () => ipcRenderer.invoke('context-prompt:clear'),
});
```

Also maintains legacy `ipcRenderer` API with allowlisted channels for backward compatibility.

## 6. Frontend Changes

### 6.1 Review Page (`src/pages/Review.tsx`)

Key additions:
- **Progress tracking**: Subscribes to `testforgeAI.onProgress()` to show current step
- **RAG-aware UI**: `showSummaryInput = useRag && promptMode === 'uploaded'`
- **Test case summary input**: Text area when using RAG with uploaded prompt
- **Generation notice**: Displays KB context usage info
- **Approve for KB**: Button to ingest generated cases into knowledge base
- **Progress labels**: Maps node names to user-friendly messages:
  - `normalize` → "Preparing steps"
  - `retrieve` → "Searching knowledge base"
  - `generate` → "Writing test cases"
  - `validate` → "Reviewing test cases"

Generation flow is **conditional**: the LangGraph API is used only when `useRag` is true, with automatic fallback to the legacy channel on error.

```typescript
if (useRag) {
  const provider = defaultModel.startsWith('claude-') ? 'claude' : 'gemini';
  const judgeProvider = judgeModel.startsWith('claude-') ? 'claude' : 'gemini';
  stopProgress = window.testforgeAI.onProgress(setGenerationStep);
  try {
    const cases = await window.testforgeAI.generate({
      actions,
      screenshots,
      provider,
      model: defaultModel,
      judgeProvider,
      judgeModel,
      useRag: true,
      useUploadedPrompt: promptMode === 'uploaded',
      testCaseSummary: promptMode === 'uploaded' ? testCaseSummary.trim() : undefined,
    });
    setGeneratedCases(cases);          // Structured TestForgeTestCase[]
    setTestCases(/* render cases to readable text */);
  } catch (graphError) {
    // Fallback: legacy generator
    const legacyResult = await window.ipcRenderer.invoke('generate-test-cases', {
      actions, screenshots, modelName: defaultModel,
      promptMode: promptMode === 'simple' ? 'simple' : 'detailed',
      useUploadedPrompt: promptMode === 'uploaded',
    });
    setTestCases(legacyResult as string);
  } finally {
    stopProgress?.();
  }
} else {
  // RAG off → legacy path only
  const legacyResult = await window.ipcRenderer.invoke('generate-test-cases', { ... });
  setTestCases(legacyResult as string);
}
```

The structured `generatedCases` array is used for KB approval; the legacy path produces a plain text/markdown string.

### 6.2 Settings Page (`src/pages/Settings.tsx`)

New features:
- **Knowledge Base Management**: Add documents, view count, clear KB
- **Context Prompt Upload**: Upload `.md/.txt` custom prompt, view filename, clear
- **Judge Model Selection**: Separate dropdown for `judgeModel`
- **Model lists**: The deprecated "Google - Older" group (Gemini 1.5 Pro, 1.5 Flash, 2.0 Flash) was removed from the Default Generation Model list; `gemini-4-argon` was added to both the Default Generation Model and Judge Model lists
- **RAG Toggle**: Enable/disable knowledge base retrieval
- **API key validation**: Runtime validation for Gemini keys

State managed via Zustand store with persistence for `defaultModel`, `judgeModel`, `useRag`.

### 6.3 App Store (`src/store/useAppStore.ts`)

Extended state:
```typescript
interface AppState {
  // ... existing
  judgeModel: string;
  useRag: boolean;
  generationStep: string | null;
  kbCount: number;
  // ... setters
}
```

Persisted fields: `defaultModel`, `judgeModel`, `useRag`

## 7. Type Definitions

### 7.1 Global Types (`src/ipc.d.ts`)

Defines the `testforgeAI` API contract and `TestForgeTestCase` interface:
```typescript
interface TestForgeTestCase {
  id: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  type: 'Functional' | 'Negative' | 'Boundary' | 'UI';
  preconditions: string[];
  setupSteps: string[];
  actionSteps: string[];
  cleanupSteps: string[];
  expectedResult: string;
}
```

Payload for generate includes judge model, RAG flag, context prompt flag, and summary.

## 8. Configuration & Build

### 8.1 Dependencies Summary
The branch adds significant LangChain/LanceDB dependencies:
- LangGraph ecosystem (~40MB+ node_modules impact)
- LanceDB with Apache Arrow for vector operations
- Text splitters for chunking

### 8.2 Electron Build
- Main process built to `dist-electron/` via Vite plugin
- Preload script bundled separately
- Uses ESM modules (`"type": "module"`)

### 8.3 Security Considerations
- API keys stored in OS keychain via `keytar` (never exposed to renderer)
- IPC uses allowlisted channels
- Path validation for file operations
- Context prompt size limited to 100KB
- Test summaries truncated to 2000 chars

## 9. Key Differences from Main Branch

Based on git history and codebase analysis:

| Feature | Main/Legacy | feature/langgraph_RAG |
|---|---|---|
| Generation Flow | Direct API calls (Claude/Gemini SDK) | LangGraph agent workflow with nodes (used when RAG on; legacy fallback on error) |
| Validation | Basic prompt instructions | Separate judge model with critique loop (max 3 iterations) |
| RAG | Not present | LanceDB + Gemini embeddings for KB retrieval |
| Context Customization | Basic prompt mode selection | Upload custom context prompt file |
| Knowledge Base | None | Ingest docs (.md/.txt/.json), track count, ingest approved cases |
| Test Case Structure | Free-text/markdown output | Structured `setupSteps`/`actionSteps`/`cleanupSteps` separation |
| Progress Tracking | Basic loading state | Node-by-node progress reporting (RAG path) |
| Model Flexibility | Single model selection | Separate generator and judge models (RAG path) |

## 10. Workflow Examples

### 10.1 Standard Generation (No RAG)
1. User records actions (clicks, keys, etc.)
2. Review page: Select provider/model, RAG off
3. Click Generate
4. Renderer routes to the **legacy** `generate-test-cases` channel (LangGraph is not used)
5. Text/markdown test cases are returned and displayed

> Note: The LangGraph graph still supports a no-retrieve configuration (the `retrieve` node becomes a no-op returning `{ context: [] }`), but the current renderer only enters the graph when `useRag` is true.

### 10.2 RAG-Enhanced Generation
1. User uploads domain docs to KB in Settings (optional)
2. Records workflow
3. Review: Enable RAG, upload context prompt, optionally add summary
4. Generate: normalize → retrieve (search KB for similar workflows) → generate with context → validate
5. Iterative refinement if needed
6. User approves → cases ingested to KB with feature tag

## 11. Potential Use Cases

- **Regression Test Creation**: Convert exploratory testing into reusable test cases
- **Domain-Specific Testing**: Use KB with product requirements to ensure coverage
- **Standardized Test Documentation**: Enforce consistent structure across QA team
- **Knowledge Capture**: Build organization-specific test patterns over time
- **Multi-Model Validation**: Use stronger judge model to improve quality

## 12. Limitations & Considerations

- **Iteration limit**: Max 3 refine loops to avoid excessive API costs
- **KB size**: Local LanceDB; large KBs may impact search latency
- **Embedding dependency**: Requires Gemini API key for embeddings (even if using Claude for generation)
- **Screenshot handling**: Screenshots passed but not directly used in LangGraph nodes (legacy path had them; nodes focus on actions/query)
- **Platform**: Primarily tested on Windows (win32)
- **Temp storage**: Screenshots stored in temp dirs with validation

## 13. Conclusion

The `feature/langgraph_RAG` branch represents a significant evolution of TestForge from a simple "prompt-and-generate" tool to an agentic test case generation system. The LangGraph orchestration provides structure, the judge model ensures quality through self-critique, and the RAG/KB system enables continuous improvement. The separation of setup/action/cleanup steps and enforcement of explicit verifications leads to more executable, higher-quality test cases.

The architecture is well-modularized with clear separation between graph logic, RAG layer, IPC, and UI. The streaming progress updates improve UX during generation. Overall, this branch delivers a more sophisticated and production-ready approach to AI-assisted test case generation.
