import fs from "node:fs/promises";
import path from "node:path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import type { Retriever, KbDoc } from "./retriever";

// A JSON array becomes one readable chunk per record; anything else falls back to text splitting.
async function splitJson(text: string, splitter: RecursiveCharacterTextSplitter): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map(item => JSON.stringify(item, null, 2));
    }
    return splitter.splitText(JSON.stringify(parsed, null, 2));
  } catch {
    return splitter.splitText(text);
  }
}

const MAX_CHUNK = 4000;

// Text/markdown is split at test-case boundaries so a worked example stays in one chunk.
async function splitText(text: string, splitter: RecursiveCharacterTextSplitter): Promise<string[]> {
  const sections = text.split(/\n(?=\s*(?:Summary\s*:|#{1,3}\s|(?:Test\s*Case|TC)[\s_-]*\d+))/i).map(s => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const section of sections) {
    if (section.length <= MAX_CHUNK) out.push(section);
    else out.push(...(await splitter.splitText(section)));
  }
  return out;
}

export async function ingestFiles(retriever: Retriever, files: string[]) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 3000, chunkOverlap: 200 });
  const docs: KbDoc[] = [];

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (ext !== ".md" && ext !== ".txt" && ext !== ".json") continue;
    const text = await fs.readFile(file, "utf8");
    const chunks = ext === ".json" ? await splitJson(text, splitter) : await splitText(text, splitter);
    chunks.filter(c => c.trim()).forEach(c => docs.push({ text: c, meta: { source: path.basename(file) } }));
  }
  await retriever.ingest(docs);
  return docs.length;
}

// Call this after the user approves generated test cases, so the
// knowledge base grows with real, reviewed examples.
export async function ingestApprovedCases(retriever: Retriever, cases: unknown[], feature: string) {
  const docs: KbDoc[] = cases.map(c => ({
    text: typeof c === "string" ? c : JSON.stringify(c),
    meta: { source: "approved-test-case", feature },
  }));
  await retriever.ingest(docs);
}
