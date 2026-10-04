import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  priority: z.enum(["High", "Medium", "Low"]),
  type: z.enum(["Functional", "Negative", "Boundary", "UI"]),
  preconditions: z.array(z.string()),
  steps: z.array(z.string()),
  expectedResult: z.string(),
});
export type TestCase = z.infer<typeof TestCaseSchema>;

// Match your existing recorded action type from actionObserver.ts
export interface RecordedAction {
  type: string;          // click, key, scroll, navigate...
  label?: string;
  target?: string;
  value?: string;
  keyCombo?: string;
  url?: string;
  elementHint?: string;
  timestamp: number;
}

// Each field is last-write-wins. Pass initial values when you invoke the graph.
export const GraphState = Annotation.Root({
  actions: Annotation<RecordedAction[]>(),
  screenshots: Annotation<string[]>(),
  query: Annotation<string>(),
  context: Annotation<string[]>(),
  testCases: Annotation<TestCase[]>(),
  critique: Annotation<string>(),
  iterations: Annotation<number>(),
});
export type GraphStateType = typeof GraphState.State;

