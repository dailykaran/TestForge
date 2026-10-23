import * as lancedb from "@lancedb/lancedb";
import type { Embeddings } from "@langchain/core/embeddings";
import type { Retriever, KbDoc } from "./retriever";

const TABLE = "knowledge_base";

export class LanceRetriever implements Retriever {
  private db!: lancedb.Connection;
  constructor(private dir: string, private embeddings: Embeddings) {}

  private async connect() {
    if (!this.db) this.db = await lancedb.connect(this.dir);
    return this.db;
  }

  async ingest(docs: KbDoc[]) {
    if (!docs.length) return;
    const db = await this.connect();
    const vectors = await this.embeddings.embedDocuments(docs.map(d => d.text));
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

  static async clear(dir: string): Promise<void> {
    const db = await lancedb.connect(dir);
    if ((await db.tableNames()).includes(TABLE)) await db.dropTable(TABLE);
  }
}
