import * as lancedb from "@lancedb/lancedb";
import type { Embeddings } from "@langchain/core/embeddings";
import type { Retriever, KbDoc, KbChunk } from "./retriever";

const TABLE = "knowledge_base";

export class LanceRetriever implements Retriever {
  private db!: lancedb.Connection;
  constructor(private dir: string, private embeddings: Embeddings) {}

  private async connect() {
    if (!this.db) this.db = await lancedb.connect(this.dir);
    return this.db;
  }

  async ingest(docs: KbDoc[]) {
    docs = docs.filter(d => d.text.trim().length > 0);
    if (!docs.length) return;
    const db = await this.connect();
    const embedded = await this.embeddings.embedDocuments(docs.map(d => d.text));
    const vectors = embedded.map(v => Array.from(v ?? [], Number));
    const dim = vectors[0]?.length ?? 0;
    if (vectors.length !== docs.length || dim === 0 || vectors.some(v => v.length !== dim || v.some(Number.isNaN))) {
      throw new Error("Gemini returned no embeddings for the uploaded text. Check the Gemini API key, model access, and quota, then try again.");
    }
    const rows = docs.map((d, i) => ({
      vector: vectors[i],
      text: d.text,
      source: d.meta.source ?? "",
      feature: d.meta.feature ?? "",
    }));
    const names = await db.tableNames();
    if (names.includes(TABLE)) {
      const t = await db.openTable(TABLE);
      await t.add(rows);
    } else {
      await db.createTable(TABLE, rows);
    }
  }

  async search(query: string, k: number) {
    const db = await this.connect();
    if (!(await db.tableNames()).includes(TABLE)) return [];
    const t = await db.openTable(TABLE);
    const qv = await this.embeddings.embedQuery(query);
    const rows = await t.search(qv).limit(k).toArray();
    return rows.map(row => row.text as string);
  }

  async count() {
    const db = await this.connect();
    if (!(await db.tableNames()).includes(TABLE)) return 0;
    return (await db.openTable(TABLE)).countRows();
  }

  // Read-only listing for the chunk viewer; needs no embeddings or API key.
  static async list(dir: string): Promise<KbChunk[]> {
    const db = await lancedb.connect(dir);
    if (!(await db.tableNames()).includes(TABLE)) return [];
    const t = await db.openTable(TABLE);
    const rows = await t.query().select(["text", "source", "feature"]).toArray();
    return rows.map((row, i) => ({
      id: i + 1,
      text: String(row.text ?? ""),
      source: String(row.source ?? ""),
      feature: String(row.feature ?? ""),
    }));
  }

  static async clear(dir: string): Promise<void> {
    const db = await lancedb.connect(dir);
    if ((await db.tableNames()).includes(TABLE)) await db.dropTable(TABLE);
  }
}
