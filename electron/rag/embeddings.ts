import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

// Use a current Gemini embedding model. Check Google's docs for the latest ID,
// since older embedding models get retired.
// The stock implementation swallows API errors and returns empty vectors,
// hiding the real cause (bad key, quota, model access). Surface them instead.
class StrictGeminiEmbeddings extends GoogleGenerativeAIEmbeddings {
  async _embedDocumentsContent(documents: string[]): Promise<number[][]> {
    const self = this as unknown as {
      client: { batchEmbedContents(req: unknown): Promise<{ embeddings?: { values?: number[] }[] }> };
      _convertToContent(text: string): unknown;
    };
    const out: number[][] = [];
    for (let i = 0; i < documents.length; i += this.maxBatchSize) {
      const chunk = documents.slice(i, i + this.maxBatchSize);
      const res = await self.client.batchEmbedContents({
        requests: chunk.map(d => ({ ...(self._convertToContent(d) as object), taskType: "RETRIEVAL_DOCUMENT" })),
      });
      for (const e of res.embeddings ?? []) out.push(e.values ?? []);
    }
    return out;
  }

  async _embedQueryContent(text: string): Promise<number[]> {
    const self = this as unknown as {
      client: { embedContent(req: unknown): Promise<{ embedding?: { values?: number[] } }> };
      _convertToContent(text: string): unknown;
    };
    const res = await self.client.embedContent({
      ...(self._convertToContent(text) as object),
      taskType: "RETRIEVAL_QUERY",
    });
    return res.embedding?.values ?? [];
  }
}

export function makeEmbeddings(geminiApiKey: string) {
  return new StrictGeminiEmbeddings({
    model: "gemini-embedding-001",
    apiKey: geminiApiKey,
  });
}
