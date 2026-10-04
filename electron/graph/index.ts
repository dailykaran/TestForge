import { StateGraph, START, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { Retriever } from "../rag/retriever";
import { GraphState } from "./state";
import { normalizeActions, makeRetrieve, makeGenerate, makeValidate } from "./nodes";

const MAX_ITERATIONS = 3;

export function buildGraph(deps: {
  retriever: Retriever;
  generator: BaseChatModel;
  judge: BaseChatModel;
  useRag: boolean;
  contextPrompt?: string;
}) {
  const g = new StateGraph(GraphState)
    .addNode("normalize", normalizeActions)
    .addNode("retrieve", deps.useRag ? makeRetrieve(deps.retriever) : async () => ({ context: [] }))
    .addNode("generate", makeGenerate(deps.generator, deps.contextPrompt))
    .addNode("validate", makeValidate(deps.judge))
    .addEdge(START, "normalize")
    .addEdge("normalize", "retrieve")
    .addEdge("retrieve", "generate")
    .addEdge("generate", "validate")
    .addConditionalEdges("validate", (s) =>
      s.critique && s.iterations < MAX_ITERATIONS ? "generate" : END
    );

  return g.compile();
}
