# Purpose of the Judge Model Feature on the Settings Page

The **Judge Model** feature on the Settings page allows you to select a separate LLM that acts as an automated reviewer/critic during the RAG-based (LangGraph) test case generation process.

## Purpose

- **Quality assurance & validation**: The judge model reviews the generated test cases against the original recorded user actions to catch errors and enforce quality standards.
- **Iterative self-correction**: When validation fails, it provides a critique, and the LangGraph pipeline loops back to the generator (up to 3 iterations) to fix the issues before returning final test cases.
- **Separation of concerns**: You can use a different model for generation vs. validation. For example, use a faster/cheaper model to generate, and a more capable model to judge, or vice versa.

## What it checks

The judge evaluates test cases against these criteria:

1. Setup, core actions, and cleanup are properly separated into their respective fields
2. Every recorded core action is covered and ordered correctly
3. Important state changes (submissions, connections, saves, syncs) have a separate `Verify that...` step with an observable expected result
4. No actions or outcomes are invented (must stay faithful to recorded steps)
5. Expected results are specific and concrete

## How it works in the codebase

1. **Settings** (`Settings.tsx`): You select the judge model from a dedicated dropdown. This value is persisted in the app store (`useAppStore.ts`) alongside `defaultModel` and `useRag`.

2. **Review flow** (`Review.tsx`): When RAG is enabled, the app determines the provider (`claude` vs `gemini`) based on the judge model name, then passes both `judgeModel` and `judgeProvider` to the generation API.

3. **Backend (LangGraph)** (`electron/graph/graph.ts` via built bundle): The graph has a `validate` node that uses the judge model with structured output (`pass` boolean + `critique` string). If `pass` is false and iterations < 3, it routes back to `generate` with the critique; otherwise it ends.

4. **Fallback behavior**: The judge model is only used in the RAG/LangGraph path (`useRag=true`). If RAG is disabled, generation uses the legacy path which doesn't employ the judge model. If the graph fails, it also falls back to legacy generation.

## Key configuration details

- **Default**: `gemini-2.5-flash`
- **Provider detection**: If the model name starts with `claude-`, it uses the Claude provider; otherwise it uses Gemini
- **Stored in Zustand** with persistence (saved between sessions)
- **Available models**: Mirror many of the generation models (Gemini 2.0/2.5/3.x variants and Claude 3.5 variants)

In short, the judge model is your automated QA reviewer that enforces structural correctness and faithfulness to recorded actions during RAG-based generation, helping produce higher-quality, executable test cases with fewer hallucinations.