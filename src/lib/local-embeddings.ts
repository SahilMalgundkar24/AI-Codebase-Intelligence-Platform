import type { EmbeddingModelV3 } from "@ai-sdk/provider";

/**
 * Must match your Pinecone index dimension exactly (Dashboard → Index → Configuration).
 * Set PINECONE_DIMENSION in .env.local (e.g. 1024 or 1536).
 */
function resolveEmbeddingDimension(): number {
  const raw = process.env.PINECONE_DIMENSION?.trim();
  const n = raw ? Number.parseInt(raw, 10) : 1024;
  if (!Number.isFinite(n) || n < 64 || n > 8192) return 1024;
  return n;
}

export const EMBEDDING_DIMENSION = resolveEmbeddingDimension();

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function hashToken(token: string): number {
  let h = 2166136261;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic feature-hashing embedding (no API calls) */
export function embedText(text: string): number[] {
  const vec = new Float32Array(EMBEDDING_DIMENSION);
  const tokens = tokenize(text);

  const addToken = (token: string, weight = 1) => {
    const h = hashToken(token);
    const idx = h % EMBEDDING_DIMENSION;
    const sign = (h & 1) === 0 ? 1 : -1;
    vec[idx] += sign * weight;
  };

  for (const token of tokens) addToken(token);
  for (let i = 0; i < tokens.length - 1; i++) {
    addToken(`${tokens[i]}_${tokens[i + 1]}`, 1.5);
  }

  let norm = 0;
  for (let i = 0; i < EMBEDDING_DIMENSION; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  return Array.from(vec, (v) => v / norm);
}

/** Vercel AI SDK–compatible embedding model (used with embed / embedMany) */
export const localEmbeddingModel: EmbeddingModelV3 = {
  specificationVersion: "v3",
  provider: "local",
  modelId: "code-hash-v1",
  maxEmbeddingsPerCall: undefined,
  supportsParallelCalls: true,
  async doEmbed({ values }) {
    return {
      embeddings: values.map((value) => embedText(value)),
      warnings: [],
    };
  },
};
