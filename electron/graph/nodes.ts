import { z } from "zod";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Retriever } from "../rag/retriever";
import { TestCaseSchema, type GraphStateType } from "./state";

export const normalizeActions = async (s: GraphStateType) => {
  const steps = s.actions.map((a, index) => {
    const detail = a.label || a.target || a.value || a.keyCombo || a.url || a.elementHint;
    return `${index + 1}. ${a.type}${detail ? `: ${detail}` : ""}`;
  });
  return { query: steps.join("\n") };
};

export const makeRetrieve = (retriever: Retriever) => async (s: GraphStateType) => {
  try {
    return { context: await retriever.search(s.query, 6) };
  } catch (error) {
    console.error('Knowledge-base retrieval failed; continuing without context.', error);
    return { context: [] };
  }
};

export const makeGenerate = (llm: BaseChatModel, contextPrompt?: string, summary?: string) => async (s: GraphStateType) => {
  const structured = llm.withStructuredOutput(
    z.object({ testCases: z.array(TestCaseSchema) })
  );

  const system =
    "You are a senior QA engineer. Write complete, executable test cases from the recorded " +
    "user actions. Put environment preparation and account/project creation in setupSteps, " +
    "only the behavior being tested in actionSteps, and teardown or data deletion in cleanupSteps. " +
    "Do not put all actions into one list. Keep preconditions limited to facts that must already " +
    "be true before setup begins. In actionSteps, represent important actions and their checks as " +
    "separate ordered strings: after each major state change, submission, connection, save, or sync, " +
    "include a distinct step beginning with 'Verify that...' and name the observable expected state. " +
    "Do not combine the action and its verification into one string, and do not invent UI elements " +
    "or outcomes. Use the reference context for domain guidance, not as evidence that an unrecorded " +
    "action occurred. Write each action step using the exact wording of the matching recorded action " +
    "(button, field, menu and page names verbatim); the user's summary describes intent only and never " +
    "replaces recorded actions." +
    (contextPrompt ? `\n\nAdditional context detail instructions:\n${contextPrompt}` : '');

  const user =
    (summary ? `Test case summary from the user:\n${summary}\n\n` : "") +
    `Recorded steps:\n${s.query}\n\n` +
    `Reference context:\n${s.context.length ? s.context.join("\n---\n") : "(none)"}\n\n` +
    (s.critique ? `A reviewer found these problems. Fix them:\n${s.critique}\n` : "");

  const res = await structured.invoke([
    { role: "system", content: system },
    { role: "user", content: user },
  ]);
  return { testCases: res.testCases, iterations: (s.iterations ?? 0) + 1 };
};

export const makeValidate = (judge: BaseChatModel, summary?: string) => async (s: GraphStateType) => {
  const verdict = await judge
    .withStructuredOutput(z.object({ pass: z.boolean(), critique: z.string() }))
    .invoke(
      "Review these test cases against the recorded steps. Check: (1) setup, core actions, and " +
      "cleanup are in their separate fields, (2) every recorded core action is covered and ordered, " +
      "(3) important state changes, submissions, connections, saves, and syncs have a separate " +
      "following actionSteps entry beginning 'Verify that...' with an observable result, (4) no " +
      "action or outcome is invented, and (5) expected results are specific. If a verification is " +
      "missing or a workflow is incorrectly grouped, fail and explain the correction.\n\n" +
      (summary ? `Test case summary from the user:\n${summary}\n\n` : "") +
      `Recorded steps:\n${s.query}\n\nTest cases:\n${JSON.stringify(s.testCases, null, 2)}`
    );
  return { critique: verdict.pass ? "" : verdict.critique };
};

