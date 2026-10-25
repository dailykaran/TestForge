export interface KbDoc {
  text: string;
  meta: Record<string, string>;   // e.g. { source: "login-requirements.md", feature: "login" }
}

export interface KbChunk {
  id: number;
  text: string;
  source: string;
  feature: string;
}

export interface Retriever {
  ingest(docs: KbDoc[]): Promise<void>;
  search(query: string, k: number): Promise<string[]>;
  count(): Promise<number>;
}
