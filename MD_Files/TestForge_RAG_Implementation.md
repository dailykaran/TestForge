# TestForge RAG Implementation (branch `feature/langgraph_RAG`)

A detailed, code-accurate description of how Retrieval-Augmented Generation (RAG) works in TestForge on this branch: where data is stored, how documents become chunks and vectors, how retrieval feeds the LangGraph workflow, and what the limits are.

Related docs: [LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md](./LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md) (branch summary) and [TestForge_LangGraph_Feature_Study.md](./TestForge_LangGraph_Feature_Study.md) (feature study).

---

## 1. Where is the RAG data stored?

### 1.1 Short answer

The LanceDB database folder is `<userData>/kb`, and the single table inside it is `knowledge_base` (stored as `knowledge_base.lance`). The uploaded context prompt is a sibling file `<userData>/context-detail-prompt.json`.

`<userData>` is **not** the standard Electron location (`%APPDATA%\testforge`). [`electron/main.ts`](../electron/main.ts) overrides it before the app starts:

```typescript
const userDataPath = process.env.NODE_ENV === 'production'
  ? path.resolve(process.env.APP_ROOT, '.app-data')
  : path.join(os.tmpdir(), 'TestForge-electron');
app.setPath('userData', userDataPath);
```

`APP_ROOT` is `process.cwd()` (set at the top of `main.ts`).

| Run mode | `<userData>` | Knowledge-base folder |
|---|---|---|
| Development (`npm run dev`, `NODE_ENV` not `production`) | `os.tmpdir()\TestForge-electron` — on Windows `C:\Users\<user>\AppData\Local\Temp\TestForge-electron` | `...\TestForge-electron\kb` |
| `NODE_ENV=production` | `<current working directory>\.app-data` | `<cwd>\.app-data\kb` |

On the development machine used for this study, the folder exists at:

```
C:\Users\Home\AppData\Local\Temp\TestForge-electron\kb\knowledge_base.lance
C:\Users\Home\AppData\Local\Temp\TestForge-electron\context-detail-prompt.json
```

At the time it was inspected, the `knowledge_base.lance` folder contained only a `_versions\...manifest` file and no data files (no `data\` folder), i.e. no chunks were currently stored. The standard `%APPDATA%\testforge` and `%APPDATA%\Electron` folders contain only Chromium/session data, not the knowledge base.

### 1.2 Practical consequences

- **Development data lives in the OS temp folder.** Windows Disk Cleanup, "Storage Sense", or a manual temp clean can delete `TestForge-electron`, which would remove the knowledge base and the uploaded prompt. Back up `kb` if the content matters.
- **Production data lives relative to the working directory.** `process.cwd()` is wherever the app was launched from, so `.app-data` follows the launch directory. Launching from a different folder, or from a shortcut whose "Start in" differs, uses a different (initially empty) knowledge base. If the app is installed under a protected folder such as `Program Files`, the folder may not be writable.
- **`NODE_ENV=production` is required for the `.app-data` path.** Nothing in the repository sets it automatically; if it is unset, even a packaged build uses the temp-folder location above. `.app-data` is already listed in `.gitignore`, so it is not committed.
- The knowledge base is **per machine and per user location**; it is not synced and is not shared between development and production runs.

### 1.3 How to inspect, back up, or reset

- **Inspect/back up:** copy the `kb` folder (and `context-detail-prompt.json`) while the app is closed.
- **Reset from the UI:** Settings → Knowledge Base → clear. This calls `LanceRetriever.clear`, which drops the `knowledge_base` table.
- **Reset manually:** close the app and delete the `kb` folder.
- The folder is created by LanceDB on first connection (`lancedb.connect(dir)`); the `knowledge_base` table is created on the first ingest.

---

## 2. Components

| File | Responsibility |
|---|---|
| [`electron/rag/retriever.ts`](../electron/rag/retriever.ts) | `KbDoc` and `Retriever` interfaces (`ingest`, `search`, `count`) |
| [`electron/rag/lancedbRetriever.ts`](../electron/rag/lancedbRetriever.ts) | LanceDB-backed implementation: ingest, vector search, count, clear |
| [`electron/rag/embeddings.ts`](../electron/rag/embeddings.ts) | Gemini embedding model factory (`gemini-embedding-001`) |
| [`electron/rag/ingest.ts`](../electron/rag/ingest.ts) | File reading and chunking; approved-case ingestion |
| [`electron/ipcHandlers.ts`](../electron/ipcHandlers.ts) | Lazy retriever creation and `kb:*` IPC handlers |
| [`electron/graph/nodes.ts`](../electron/graph/nodes.ts) | `retrieve` node and use of retrieved context in `generate` |
| [`electron/preload.ts`](../electron/preload.ts), [`src/ipc.d.ts`](../src/ipc.d.ts) | `window.testforgeAI` bridge and types |
| [`src/pages/Settings.tsx`](../src/pages/Settings.tsx), [`src/pages/Review.tsx`](../src/pages/Review.tsx) | RAG toggle, KB management, "Approve for KB" |

### 2.1 Interfaces

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

The graph depends only on `Retriever`, so the LanceDB implementation can be replaced without changing the graph. When RAG is off, `testcases:generate` passes a no-op retriever (`ingest`/`search`/`count` return nothing).

### 2.2 Retriever creation (`getLanceRetriever`)

- Created lazily on first use and cached as a promise (`lanceRetrieverPromise`).
- Reads the Gemini API key from the OS keychain (main process). If there is none it throws `Add a Gemini API key to use the knowledge base.` and clears the cache so a later attempt (after the user adds a key) retries.
- Builds `new LanceRetriever(path.join(app.getPath('userData'), 'kb'), makeEmbeddings(apiKey))`.
- Because the embedder holds the key it was created with, **changing the Gemini key at runtime does not rebuild an already-created retriever** until the app restarts (only a failed creation resets the cache).

---

## 3. Data model

The LanceDB table `knowledge_base` is created from the first batch of rows; its schema is inferred from them. Each row has:

| Column | Type | Content |
|---|---|---|
| `vector` | float array | Gemini embedding of `text` |
| `text` | string | The chunk text (what retrieval returns) |
| `source` | string | File name for imported documents, or `approved-test-case` for approved cases (empty string if unknown) |
| `feature` | string | Feature label. Set to `recorded-session` (the label `Review.tsx` passes, truncated to 120 chars) for approved cases; **empty string for imported documents** |

Only `text` is used at retrieval time. `source` and `feature` are stored as metadata but are not currently used to filter or display results.

---

## 4. Ingestion flows

### 4.1 Adding documents (Settings → Add documents)

1. The renderer calls `window.testforgeAI.addKnowledgeFiles()` → IPC `kb:addFiles`.
2. The main process shows an Electron open dialog (multi-select, filter `md`, `txt`, `json`).
3. If the dialog is cancelled the handler returns `{ added: 0 }`.
4. `ingestFiles(retriever, filePaths)`:
   - Skips any file whose extension is not `.md`, `.txt`, or `.json` (case-insensitive).
   - Reads each file as UTF-8.
   - Splits with `RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 120 })` from `@langchain/textsplitters`. Sizes are in **characters**, not tokens.
   - Wraps each chunk as `{ text, meta: { source: <file basename> } }`.
   - Calls `retriever.ingest(docs)` once with all chunks.
5. `LanceRetriever.ingest`:
   - Returns immediately for an empty list.
   - Embeds all chunk texts with `embeddings.embedDocuments(...)`.
   - Builds rows `{ vector, text, source, feature }`.
   - If the `knowledge_base` table exists it opens it and calls `table.add(rows)`; otherwise `db.createTable('knowledge_base', rows)`.
6. The handler returns the number of chunks added; Settings shows "N document chunks added." and refreshes the count.

Notes:
- **No de-duplication.** Adding the same file twice stores its chunks twice, which can bias retrieval toward duplicates. Clear the base before re-importing an updated document.
- JSON files are treated as plain text and split by the same character splitter (not parsed as structured data).
- All chunks from a selection are embedded in one `embedDocuments` call; very large selections cost more API time and quota, and a failure aborts the whole add.
- Document text is sent to Google's embedding API; do not import confidential material unless that is acceptable.

### 4.2 Approving generated test cases (Review → Approve for KB)

1. The button appears when test cases are shown (`testCases` is non-empty).
2. `handleApproveForKnowledgeBase` uses the structured `generatedCases` from the last graph run. If there are none (for example the legacy generator produced the text), it wraps the displayed text in a single placeholder case (`title: 'Approved generated test cases'`, with the text in `actionSteps`).
3. `window.testforgeAI.ingestApprovedCases(cases, 'recorded-session')` → IPC `kb:ingest-approved`.
4. The main process validates that `cases` is a non-empty array (else it throws `No approved test cases were provided.`), truncates the feature label to 120 characters, and calls `ingestApprovedCases`.
5. `ingestApprovedCases` stores **one row per test case**: `text = JSON.stringify(case)`, `source = 'approved-test-case'`, `feature = <label>`. Cases are **not chunked**, so a long case is embedded and retrieved as a single block.
6. The UI shows "N approved test cases added to the knowledge base." and refreshes the chunk count.

Approval is an explicit user action. Generating or exporting does not write to the knowledge base, and nothing in the code verifies that a case has actually been reviewed.

### 4.3 Clearing

Settings → clear → `kb:clear` → `LanceRetriever.clear(<userData>/kb)`: connects to the folder and drops the `knowledge_base` table if it exists. The `kb` folder itself and the uploaded context prompt are not deleted. The next ingest recreates the table.

### 4.4 Count

`kb:count` returns `table.countRows()` (0 if the table does not exist). Settings shows it as "N indexed chunks" (this includes approved cases). It is loaded when Settings opens; if there is no Gemini key the retriever cannot be created, so the count request fails and the UI logs a warning and keeps its previous value.

---

## 5. Retrieval and generation

### 5.1 When RAG runs

The Review page only calls the LangGraph path (`testcases:generate`) when the **RAG toggle** (`useRag`, persisted in the store, default `false`) is on. With RAG off, the legacy generators are used and no retrieval happens. The graph itself also tolerates a no-op retriever.

### 5.2 Graph flow

```
START → normalize → retrieve → generate → validate ─┐
                                  ▲                  │ critique present and iterations < 3
                                  └──────────────────┘
                                  otherwise → END
```

Retrieval runs **once**, before the first generation. Refinement passes reuse the same retrieved `context`; retrieval is not repeated per pass.

### 5.3 The query

The `normalize` node converts recorded actions into numbered lines, for example:

```
1. click: Login
2. type: admin
3. click: Submit
```

Each line is `<index>. <type>[: <label | target | value | keyCombo | url | elementHint>]`, using the first available detail in that order. This text is the **search query**. The optional user summary and the context prompt are **not** part of the query.

> Typed values (for example form input text) can appear in the query and are therefore sent to the embedding API.

### 5.4 Search

`LanceRetriever.search(query, 6)`:

1. If the table does not exist, returns `[]`.
2. Embeds the query with `embedQuery`.
3. Runs `table.search(vector).limit(6).toArray()` — LanceDB's default nearest-neighbour search (no explicit metric, filter, score threshold, or re-ranking is configured).
4. Returns each row's `text` as a string.

There is no minimum-similarity cut-off: if the table has any rows, up to six chunks are always returned even if they are barely relevant. Imported-document chunks and approved cases are searched together.

### 5.5 Error handling

The `retrieve` node wraps the search in `try/catch`; on failure it logs `Knowledge-base retrieval failed; continuing without context.` and sets `context: []`. Generation continues without references. (Failure to **create** the retriever when RAG is on — for example, no Gemini key — happens earlier in `testcases:generate` and fails the graph request; the Review page then reports the reason and falls back to the legacy generator.)

### 5.6 How context is used

In the `generate` node the user message is built as:

```
Test case summary from the user:        (only if a summary was supplied)
<summary>

Recorded steps:
<normalized query>

Reference context:
<chunk 1>
---
<chunk 2>
---
...                                      (or "(none)" when no context)

A reviewer found these problems. Fix them:   (only on refinement passes)
<critique>
```

The system prompt instructs the model to use reference context **for domain guidance only, not as evidence that an unrecorded action occurred**, to follow recorded action wording verbatim, and to avoid inventing UI elements. The judge model (`validate`) does **not** receive the retrieved context; it checks the generated cases against the recorded steps and the summary.

Provider note: the generator and judge may be Claude or Gemini (inferred from the `claude-` prefix), but embeddings are always Gemini, so a Gemini key is required whenever RAG is on, even if Claude generates.

---

## 6. IPC surface

| Renderer call (`window.testforgeAI`) | IPC channel | Purpose |
|---|---|---|
| `generate(payload)` | `testcases:generate` | Run the graph (uses retriever when `useRag`) |
| `onProgress(cb)` | `testcases:progress` | Receive node names (`normalize`, `retrieve`, `generate`, `validate`) |
| `addKnowledgeFiles()` | `kb:addFiles` | Choose files and ingest chunks |
| `knowledgeCount()` | `kb:count` | Row count |
| `clearKnowledgeBase()` | `kb:clear` | Drop the table |
| `ingestApprovedCases(cases, feature)` | `kb:ingest-approved` | Add approved cases |
| `getContextPromptInfo()` / `uploadContextPrompt()` / `clearContextPrompt()` | `context-prompt:get` / `upload` / `clear` | Manage the optional context prompt (not part of the vector store) |

All of this runs in the main process; the renderer never receives the API key or touches LanceDB directly.

---

## 7. Packaging

[`electron-builder.config.js`](../electron-builder.config.js) unpacks `@lancedb` and `apache-arrow` from the asar archive (`asarUnpack`), and [`vite.config.ts`](../vite.config.ts) marks `@lancedb/lancedb`, `apache-arrow`, `@langchain/*`, and `zod` as external for the main-process bundle so they load from `node_modules` at runtime. LanceDB ships a native binary, which is why it cannot live inside the asar.

---

## 8. Security and privacy

- **Sent to Google (embeddings):** imported document chunks, approved-case JSON, and the normalized action query (which can include typed values).
- **Sent to the generation/judge provider:** retrieved chunk text inside the prompt, plus the summary and recorded steps.
- **Stored locally, unencrypted:** all chunks and vectors under `<userData>/kb`. Anyone with access to that folder can read the text. In development it is in the shared temp directory of the user profile.
- API keys stay in the OS keychain (`keytar`) and are read only in the main process.
- Do not ingest secrets, credentials, or personal data. Approved cases generated from recordings may contain whatever was typed or visible during the session.

---

## 9. Known limitations and improvement ideas

| Limitation | Notes / idea |
|---|---|
| Storage path is temp-based in development and cwd-based in production | Use the standard `userData` location (or a fixed per-user folder) so the KB survives temp cleanup and launch-directory changes |
| No de-duplication or per-document delete | Track document IDs/hashes; allow removing a single source |
| Always returns top 6, no relevance threshold | Add a distance cut-off or hybrid keyword + vector search |
| Metadata (`source`, `feature`) unused in retrieval | Filter or boost by feature/source |
| Approved cases are not chunked and are not reviewed programmatically | Chunk long cases; add an explicit review/approval record |
| Retriever caches the first Gemini key until restart | Rebuild the retriever when the key changes |
| One query from action text only | Include the user summary or generate a query with the LLM |
| Retrieval happens once per generation | Re-query using judge critique on refinement passes |
| Embedding model is hard-coded (`gemini-embedding-001`) | Make it configurable; changing models requires re-embedding because vectors from different models are not comparable |
| Screenshots are not part of retrieval or of the graph prompt | Add multimodal context if needed |

---

## 10. Quick reference

| Item | Value |
|---|---|
| Vector store | LanceDB (`@lancedb/lancedb`), table `knowledge_base` |
| Embedding model | Gemini `gemini-embedding-001` via `@langchain/google-genai` |
| Chunking | `RecursiveCharacterTextSplitter`, 800 characters, 120 overlap |
| Supported import types | `.md`, `.txt`, `.json` (read as UTF-8 text) |
| Results per query | 6 (`retriever.search(query, 6)`) |
| Dev storage | `%TEMP%\TestForge-electron\kb` |
| Production storage (`NODE_ENV=production`) | `<cwd>\.app-data\kb` |
| Uploaded prompt | `<userData>\context-detail-prompt.json` (max 100 KB, `.md`/`.txt`) |
| Summary limit | 2000 characters |
| Refinement limit | 3 generation passes |
| Required key | Gemini API key (always, for embeddings) |
