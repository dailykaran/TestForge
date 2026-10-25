# TestForge

TestForge is an Electron desktop app that records user interactions and uses AI to turn those recordings into structured QA test cases. Generated cases can be reviewed, refined, and exported as Word documents.

## Features

- Record desktop interactions and capture screenshots for review.
- Generate test cases with Anthropic Claude or Google Gemini.
- Choose between built-in **Detailed** and **Simple** generation prompts.
- Use an uploaded Markdown or text context prompt to define a custom test-case format.
- Optionally augment uploaded-prompt generation with a local LanceDB knowledge base of reference documents and approved test cases.
- Browse, search, filter, and copy indexed knowledge-base chunks from Settings.
- Review generated cases, inspect recorded screenshots, and approve uploaded-prompt results for future retrieval.
- Review and export generated cases as `.docx` or `.txt`.
- Store provider API keys in the operating system keychain.

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A Claude API key and/or Gemini API key for generation
- A Gemini API key is required for knowledge-base embeddings, even if Claude is selected as the generation model.
- Uploaded context prompts must be Markdown or text files no larger than 100 KB.

## Getting started

Install dependencies:

```bash
npm install
```

Start the development app:

```bash
npm run dev
```

Build the application:

```bash
npm run build
```

Preview the built renderer:

```bash
npm run preview
```

Run lint checks:

```bash
npm run lint
```

## Typical workflow

1. Open **Settings** and add the API key(s) for the provider(s) you plan to use.
2. Choose a default generation model and judge model.
3. Optionally enable the knowledge base and add `.md`, `.txt`, or `.json` reference files. Use **View chunks** to inspect indexed content, or clear the index and rebuild it.
4. Optionally upload an `.md` or `.txt` context prompt. The prompt appears as an additional option in the Review screen.
5. Record the workflow you want to test.
6. Review the recording and select a generation mode:
   - **Detailed** uses the built-in comprehensive prompt.
   - **Simple** uses the built-in lightweight prompt.
   - **Uploaded** uses the uploaded prompt as the authority for headings, structure, wording, and level of detail. This mode also accepts an optional test-case summary.
7. Generate, review, and export the test cases. Uploaded-prompt results can be approved for inclusion in the knowledge base.

Detailed and Simple modes use the direct Claude/Gemini generators and do not use the knowledge base. Uploaded mode runs through the LangGraph workflow: it normalizes recorded actions, optionally retrieves relevant context, generates cases according to the uploaded prompt, and asks the judge model to review them. The workflow can revise the output based on judge feedback, with a maximum of four generation iterations. Up to 20 recorded screenshots are sent to the selected provider for generation.

## Knowledge base and RAG

The knowledge base is stored locally in LanceDB under the Electron user-data directory. Supported reference files are `.md`, `.txt`, and `.json`:

- Markdown and text are split at likely test-case boundaries and then into overlapping chunks.
- JSON arrays are indexed one record per chunk where possible.
- Retrieved context is deduplicated and limited before it is included in generation.
- Approved generated cases are stored as `approved-test-case` entries and can guide future uploaded-prompt runs.

Knowledge-base ingestion and retrieval use Gemini embeddings, so a Gemini API key is required even when Claude is selected as the generation or judge model. The chunk viewer is read-only and does not require embeddings to display existing indexed content.

## Architecture

- `electron/` — Electron main process, IPC handlers, recording and provider integration.
- `electron/graph/` — LangGraph generation state, model factory, nodes, and workflow.
- `electron/rag/` — LanceDB retrieval, Gemini embeddings, and knowledge-base ingestion.
- `src/` — React renderer, settings, review UI, chunk viewer, prompt selection, and persisted preferences.
- `dist-electron/` — compiled Electron output.

The renderer communicates with the main process through the preload bridge. Provider keys and knowledge-base operations are handled in the main process; the renderer receives generation progress (`normalize`, `retrieve`, `generate`, and `validate`) and final results. API keys are stored in the operating system keychain rather than application preferences.

## Documentation

- [LangGraph/RAG branch implementation](./MD_Files/LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md) — implementation details, flow, storage, and behavior.
- [RAG implementation details](./MD_Files/TestForge_RAG_Implementation.md) — storage locations, chunking, retrieval, and limits.
- [LangGraph feature study](./MD_Files/TestForge_LangGraph_Feature_Study.md) — design and feature study.
- [Architecture overview](./MD_Files/TestForge_Architecture.md)
- [Detailed product study](./MD_Files/TestForge_Detailed_Study.md)
- [Executable build guide](./MD_Files/TESTFORGE_EXE_BUILD_GUIDE.md)
