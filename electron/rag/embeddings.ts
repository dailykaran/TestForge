import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

// Use a current Gemini embedding model. Check Google's docs for the latest ID,
// since older embedding models get retired.
export function makeEmbeddings(geminiApiKey: string) {
  return new GoogleGenerativeAIEmbeddings({
    model: "gemini-embedding-001",
    apiKey: geminiApiKey,
  });
}
