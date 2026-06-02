import { anthropic } from "@ai-sdk/anthropic";
import { localEmbeddingModel } from "./local-embeddings";

/** Claude Haiku 4.5 for chat, wiki, and analysis */
export const chatModel = anthropic("claude-haiku-4-5");

/**
 * Local embeddings via Vercel AI SDK (no OpenAI).
 * Anthropic does not provide an embeddings API — vectors are computed in-process.
 */
export const embeddingModel = localEmbeddingModel;

export { EMBEDDING_DIMENSION } from "./local-embeddings";
