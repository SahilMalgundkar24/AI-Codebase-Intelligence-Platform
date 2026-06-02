import { embed } from "ai";
import { embeddingModel } from "./ai";
import { BM25Index } from "./bm25";
import { queryVectors } from "./pinecone";
import { getSession } from "./session";
import type { RetrievedChunk, TraceEntry } from "./types";

const TOP_K_VECTOR = 12;
const TOP_K_FINAL = 8;

function normalizeScores(scores: number[]): number[] {
  const max = Math.max(...scores, 1e-8);
  const min = Math.min(...scores, 0);
  const range = max - min || 1;
  return scores.map((s) => (s - min) / range);
}

export async function hybridRetrieve(
  sessionId: string,
  query: string,
): Promise<{ chunks: RetrievedChunk[]; traces: TraceEntry[] }> {
  const session = getSession(sessionId);
  if (!session) {
    return { chunks: [], traces: [] };
  }

  const { embedding } = await embed({
    model: embeddingModel,
    value: query,
  });

  const vectorHits = await queryVectors(
    sessionId,
    embedding,
    TOP_K_VECTOR,
  );

  const bm25 = new BM25Index(session.chunkTexts);
  const bm25Scores = bm25.score(query);
  const normBm25 = normalizeScores(bm25Scores);

  const chunkById = new Map(session.chunks.map((c) => [c.id, c]));
  const vectorScoreById = new Map(
    vectorHits.map((h) => [h.id, h.score]),
  );

  const candidateIds = new Set<string>();
  for (const h of vectorHits) candidateIds.add(h.id);
  session.chunks.forEach((c, i) => {
    if (bm25Scores[i] > 0) candidateIds.add(c.id);
  });

  const ranked: RetrievedChunk[] = [];

  for (const id of candidateIds) {
    const chunk = chunkById.get(id);
    if (!chunk) continue;
    const idx = session.chunks.findIndex((c) => c.id === id);
    const vectorScore = vectorScoreById.get(id) ?? 0;
    const bm25Score = idx >= 0 ? normBm25[idx] : 0;
    const combinedScore = vectorScore * 0.6 + bm25Score * 0.4;
    ranked.push({
      ...chunk,
      vectorScore,
      bm25Score,
      combinedScore,
    });
  }

  ranked.sort((a, b) => b.combinedScore - a.combinedScore);
  const top = ranked.slice(0, TOP_K_FINAL);

  const traces: TraceEntry[] = top.map((c) => ({
    chunkId: c.id,
    filePath: c.filePath,
    functionName: c.functionName,
    startLine: c.startLine,
    endLine: c.endLine,
    vectorScore: Math.round(c.vectorScore * 1000) / 1000,
    bm25Score: Math.round(c.bm25Score * 1000) / 1000,
    combinedScore: Math.round(c.combinedScore * 1000) / 1000,
    preview: c.content.slice(0, 160).replace(/\s+/g, " "),
  }));

  return { chunks: top, traces };
}

export function formatContextForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No relevant code chunks retrieved.";
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.filePath}:${c.startLine}-${c.endLine}` +
        (c.functionName ? ` (${c.chunkType} ${c.functionName})` : "") +
        `\n\`\`\`${c.language}\n${c.content}\n\`\`\``,
    )
    .join("\n\n");
}
