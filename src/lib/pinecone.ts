import { Pinecone } from "@pinecone-database/pinecone";
import type { CodeChunk } from "./types";
import { EMBEDDING_DIMENSION } from "./local-embeddings";

type VectorRecord = {
  id: string;
  values: number[];
  metadata: Record<string, string | number>;
};

const inMemoryVectors = new Map<string, VectorRecord[]>();

/** Pinecone vector IDs: ASCII letters, digits, - _ only */
export function sanitizeVectorId(id: string): string {
  return id.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 512);
}

/** When Pinecone index is missing or unreachable, use in-memory store */
let pineconeDisabled = false;
let pineconeInitDone = false;
const sessionVectorStore = new Map<string, "pinecone" | "memory">();

/** Call at the start of each ingest so a prior network blip does not permanently disable Pinecone */
export function preparePineconeForIngest(): void {
  if (!envPineconeConfigured()) return;
  pineconeDisabled = false;
  pineconeInitDone = false;
}

export function getSessionVectorStore(sessionId: string): "pinecone" | "memory" {
  return sessionVectorStore.get(sessionId) ?? "memory";
}

function envPineconeConfigured(): boolean {
  if (process.env.SKIP_PINECONE === "true") return false;
  return Boolean(
    process.env.PINECONE_API_KEY?.trim() &&
      process.env.PINECONE_INDEX?.trim(),
  );
}

function getClient(): Pinecone {
  return new Pinecone({ apiKey: process.env.PINECONE_API_KEY!.trim() });
}

function indexName(): string {
  return process.env.PINECONE_INDEX!.trim();
}

function isNotFoundError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { status?: number; message?: string };
    if (e.status === 404) return true;
    if (e.message?.includes("404")) return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntilIndexReady(
  pc: Pinecone,
  name: string,
  maxAttempts = 5,
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const desc = await pc.describeIndex(name);
      if (desc.status?.ready) return;
    } catch {
      // retry
    }
    await sleep(2000);
  }
  throw new Error(
    `Pinecone index "${name}" is not ready yet. Wait a minute and try again.`,
  );
}

/**
 * Ensures the index exists. Creates a serverless index on 404 if
 * PINECONE_AUTO_CREATE=true (default when key + index name are set).
 */
export async function ensurePineconeIndex(): Promise<boolean> {
  if (!envPineconeConfigured() || pineconeDisabled) return false;
  if (pineconeInitDone) return true;

  const pc = getClient();
  const name = indexName();
  const autoCreate = process.env.PINECONE_AUTO_CREATE !== "false";

  try {
    const desc = await pc.describeIndex(name);
    if (!desc.status?.ready) {
      await waitUntilIndexReady(pc, name);
    }
    pineconeInitDone = true;
    return true;
  } catch (err) {
    if (!isNotFoundError(err)) {
      pineconeDisabled = true;
      console.warn(
        "[pinecone] Unavailable — using in-memory vectors:",
        err instanceof Error ? err.message : err,
      );
      return false;
    }

    if (!autoCreate) {
      pineconeDisabled = true;
      console.warn(
        `[pinecone] Index "${name}" not found. Create it in https://app.pinecone.io ` +
          `(dimension ${EMBEDDING_DIMENSION}, metric cosine) or set PINECONE_AUTO_CREATE=true.`,
      );
      return false;
    }

    try {
      await pc.createIndex({
        name,
        dimension: EMBEDDING_DIMENSION,
        metric: "cosine",
        spec: {
          serverless: {
            cloud: (process.env.PINECONE_CLOUD as "aws" | "gcp") ?? "aws",
            region: process.env.PINECONE_REGION ?? "us-east-1",
          },
        },
      });
      await waitUntilIndexReady(pc, name);
      pineconeInitDone = true;
      return true;
    } catch (createErr) {
      pineconeDisabled = true;
      console.warn(
        "[pinecone] Could not create index — using in-memory vectors:",
        createErr instanceof Error ? createErr.message : createErr,
      );
      return false;
    }
  }
}

function usePinecone(): boolean {
  return envPineconeConfigured() && !pineconeDisabled;
}

async function getPineconeIndex() {
  const ready = await ensurePineconeIndex();
  if (!ready) throw new Error("Pinecone not available");
  return getClient().index(indexName());
}

export async function upsertChunkVectors(
  sessionId: string,
  chunks: CodeChunk[],
  embeddings: number[][],
): Promise<void> {
  try {
    await upsertChunkVectorsInner(sessionId, chunks, embeddings);
  } catch (err) {
    pineconeDisabled = true;
    console.warn(
      "[pinecone] Unexpected error — using in-memory vectors:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function upsertChunkVectorsInner(
  sessionId: string,
  chunks: CodeChunk[],
  embeddings: number[][],
): Promise<void> {
  const records: VectorRecord[] = chunks.map((chunk, i) => ({
    id: chunk.id,
    values: embeddings[i],
    metadata: {
      sessionId,
      filePath: chunk.filePath,
      functionName: chunk.functionName ?? "",
      language: chunk.language,
      chunkType: chunk.chunkType,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content.slice(0, 2000),
    },
  }));

  inMemoryVectors.set(sessionId, records);
  sessionVectorStore.set(sessionId, "memory");

  if (!(await ensurePineconeIndex()) || !usePinecone()) {
    return;
  }

  try {
    const index = await getPineconeIndex();
    const namespace = index.namespace(sessionId);
    const batchSize = 100;
    for (let i = 0; i < records.length; i += batchSize) {
      await namespace.upsert({ records: records.slice(i, i + batchSize) });
    }
    sessionVectorStore.set(sessionId, "pinecone");
    console.info(
      `[pinecone] Upserted ${records.length} vectors to index "${indexName()}" (namespace ${sessionId})`,
    );
  } catch (err) {
    pineconeDisabled = true;
    sessionVectorStore.set(sessionId, "memory");
    const msg = err instanceof Error ? err.message : String(err);
    const dimHint = msg.includes("dimension")
      ? ` Set PINECONE_DIMENSION=${EMBEDDING_DIMENSION} in .env.local to match your index.`
      : "";
    console.warn(
      "[pinecone] Upsert failed — using in-memory vectors for this session:",
      msg + dimHint,
    );
  }
}

export async function queryVectors(
  sessionId: string,
  queryEmbedding: number[],
  topK: number,
): Promise<{ id: string; score: number }[]> {
  if (!(await ensurePineconeIndex()) || !usePinecone()) {
    const records = inMemoryVectors.get(sessionId) ?? [];
    const scored = records.map((r) => ({
      id: r.id,
      score: cosineSimilarity(queryEmbedding, r.values),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  try {
    const index = await getPineconeIndex();
    const result = await index.namespace(sessionId).query({
      vector: queryEmbedding,
      topK,
      includeMetadata: true,
    });
    return (result.matches ?? []).map((m) => ({
      id: m.id,
      score: m.score ?? 0,
    }));
  } catch {
    const records = inMemoryVectors.get(sessionId) ?? [];
    const scored = records.map((r) => ({
      id: r.id,
      score: cosineSimilarity(queryEmbedding, r.values),
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }
}

export async function deleteSessionVectors(sessionId: string): Promise<void> {
  inMemoryVectors.delete(sessionId);
  if (!usePinecone()) return;
  try {
    const index = await getPineconeIndex();
    await index.namespace(sessionId).deleteAll();
  } catch {
    // namespace may not exist
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8);
}

export function getEmbeddingDimension(): number {
  return EMBEDDING_DIMENSION;
}

/** User-facing hint when Pinecone env is set but index is missing */
export function pineconeSetupHint(): string | null {
  if (!envPineconeConfigured()) return null;
  return (
    `Pinecone index "${indexName()}" must exist (dimension ${EMBEDDING_DIMENSION}, cosine). ` +
    `Create it at https://app.pinecone.io or let the app auto-create on first ingest. ` +
    `To skip Pinecone, remove PINECONE_API_KEY and PINECONE_INDEX from .env.local.`
  );
}
