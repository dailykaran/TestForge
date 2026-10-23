# TestForge

TestForge is an Electron desktop app that records user interactions and uses AI to turn those recordings into structured QA test cases. Generated cases can be reviewed, refined, and exported as Word documents.

## Features

- Record desktop interactions and capture screenshots for review.
- Generate test cases with Anthropic Claude or Google Gemini.
- Choose a generation model and, when using the LangGraph flow, a separate judge model.
- Optionally augment generation with a local LanceDB knowledge base of reference documents and approved test cases.
- Use an uploaded Markdown or text context prompt to guide test case generation.
- Review and export generated cases as `.docx` or `.txt`.
- Store provider API keys in the operating system keychain.

## Requirements

- Node.js 18 or newer
- npm 9 or newer
- A Claude API key and/or Gemini API key for generation
- A Gemini API key is required for knowledge-base embeddings, even if Claude is selected as the generation model.

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
3. Optionally enable the knowledge base and add `.md`, `.txt`, or `.json` reference files. You can also upload an `.md` or `.txt` context prompt.
4. Record the workflow you want to test.
5. Review the recording and generate test cases.
6. Review and export the generated cases. Approved cases can be added to the knowledge base for future retrieval.

When knowledge-base/RAG mode is enabled, generation runs through the LangGraph workflow: it normalizes recorded actions, retrieves relevant context, generates structured cases, and asks the judge model to review them. The workflow can revise cases based on judge feedback, with a maximum of three generation passes. If RAG mode is disabled, the app uses its existing direct Claude/Gemini generator instead.

## Architecture

- `electron/` — Electron main process, IPC handlers, recording and provider integration.
- `electron/graph/` — LangGraph generation state, model factory, nodes, and workflow.
- `electron/rag/` — LanceDB retrieval, Gemini embeddings, and knowledge-base ingestion.
- `src/` — React renderer, settings, review UI, and persisted preferences.
- `dist-electron/` — compiled Electron output.

The renderer communicates with the main process through the preload bridge. Provider keys and knowledge-base operations are handled in the main process; the renderer receives generation progress and results.

## Documentation

- [LangGraph/RAG branch implementation](./MD_Files/LANGGRAPH_RAG_BRANCH_IMPLEMENTATION.md) — implementation details, flow, storage, and behavior.
- [RAG implementation details](./MD_Files/TestForge_RAG_Implementation.md) — storage locations, chunking, retrieval, and limits.
- [LangGraph feature study](./MD_Files/TestForge_LangGraph_Feature_Study.md) — design and feature study.
- [Architecture overview](./MD_Files/TestForge_Architecture.md)
- [Detailed product study](./MD_Files/TestForge_Detailed_Study.md)
- [Executable build guide](./MD_Files/TESTFORGE_EXE_BUILD_GUIDE.md)
