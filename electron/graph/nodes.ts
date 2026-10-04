import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Retriever } from "../rag/retriever";
import { TestCaseSchema, type GraphStateType } from "./state";

export const normalizeActions = async (s: GraphStateType) => {
  const steps = s.actions.map(a => {
    const detail = a.label || a.target || a.value || a.keyCombo || a.url || a.elementHint;
    return `${a.type}${detail ? `: ${detail}` : ""}`;
  });
  return { query: steps.join("; ") };
};

export const makeRetrieve = (retriever: Retriever) => async (s: GraphStateType) => {
  const context = await retriever.search(s.query, 6);
  return { context };
};

export const makeGenerate = (llm: BaseChatModel, contextPrompt?: string) => async (s: GraphStateType) => {
  const structured = llm.withStructuredOutput(
    z.object({ testCases: z.array(TestCaseSchema) })
  );

  const system =
    "You are a senior QA engineer. Write complete, executable test cases from the recorded " +
    "user actions. Use the reference context for style, naming and coverage ideas, but never " +
    "invent UI elements that do not appear in the recorded steps." +
    (contextPrompt ? `\n\nAdditional context detail instructions:\n${contextPrompt}` : '');

  const user =
    `Recorded steps:\n${s.query}\n\n` +
    `Reference context:\n${s.context.length ? s.context.join("\n---\n") : "(none)"}\n\n` +
    (s.critique ? `A reviewer found these problems. Fix them:\n${s.critique}\n` : "");

  const res = await structured.invoke([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  return { testCases: res.testCases, iterations: (s.iterations ?? 0) + 1 };
};

export const makeValidate = (judge: BaseChatModel) => async (s: GraphStateType) => {
  const verdict = await judge
    .withStructuredOutput(z.object({ pass: z.boolean(), critique: z.string() }))
    .invoke(
      "Review these test cases against the recorded steps. Check: (1) every recorded step is " +
      "covered, (2) steps are accurate and in order, (3) nothing is invented, (4) expected " +
      "results are specific.\n\n" +
      `Recorded steps:\n${s.query}\n\nTest cases:\n${JSON.stringify(s.testCases, null, 2)}`
    );
  return { critique: verdict.pass ? "" : verdict.critique };
};

