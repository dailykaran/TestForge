import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type Provider = "claude" | "gemini";

export function makeChatModel(
  provider: Provider,
  model: string,       // the model ID chosen in Settings
  apiKey: string       // from your existing keychain getter
): BaseChatModel {
  return provider === "claude"
    ? new ChatAnthropic({ model, apiKey, temperature: 0.2 })
    : new ChatGoogleGenerativeAI({ model, apiKey, temperature: 0.2 });
}
