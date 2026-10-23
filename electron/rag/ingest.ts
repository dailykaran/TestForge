import fs from "node:fs/promises";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Retriever, KbDoc } from "./retriever";

export async function ingestFiles(retriever: Retriever, files: string[]) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 800, chunkOverlap: 120 });
  const docs: KbDoc[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== ".md" && ext !== ".txt" && ext !== ".json") continue;
    const text = await fs.readFile(file, "utf8");
    const chunks = await splitter.splitText(text);
    chunks.forEach(c => docs.push({ text: c, meta: { source: path.basename(file) } }));
  }
  await retriever.ingest(docs);
  return docs.length;
}

// Call this after the user approves generated test cases, so the
// knowledge base grows with real, reviewed examples.
export async function ingestApprovedCases(retriever: Retriever, cases: unknown[], feature: string) {
  const docs: KbDoc[] = cases.map(c => ({
    text: JSON.stringify(c),
    meta: { source: "approved-test-case", feature },
  }));
  await retriever.ingest(docs);
}
