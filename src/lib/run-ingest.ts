import { embedMany } from "ai";
import { randomUUID } from "crypto";
import { embeddingModel } from "@/lib/ai";
import { chunkRepository } from "@/lib/chunker";
import { buildDependencyGraph } from "@/lib/dependencies";
import { formatServiceError } from "@/lib/errors";
import { fetchRepoFiles, parseGitHubUrl } from "@/lib/github";
import {
  getSessionVectorStore,
  preparePineconeForIngest,
  sanitizeVectorId,
  upsertChunkVectors,
} from "@/lib/pinecone";
import { createSession } from "@/lib/session";
import type { IngestResult } from "@/lib/types";

const MAX_FILES = 500;

export async function runIngest(
  repoUrl: string,
): Promise<
  | { success: true; data: IngestResult }
  | { success: false; error: string }
> {
  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    return {
      success: false,
      error: "Invalid GitHub URL. Example: https://github.com/owner/repo",
    };
  }

  let files: { path: string; content: string }[];
  let defaultBranch: string;
  let capped: boolean;

  try {
    ({ files, defaultBranch, capped } = await fetchRepoFiles(parsed, MAX_FILES));
  } catch (err) {
    return {
      success: false,
      error: formatServiceError(err, "downloading the repository from GitHub"),
    };
  }

  if (files.length === 0) {
    return {
      success: false,
      error: "No readable source files found in this repository.",
    };
  }

  const sessionId = randomUUID();
  const chunks = chunkRepository(files, sessionId).map((c) => ({
    ...c,
    id: sanitizeVectorId(c.id),
  }));
  const chunkTexts = chunks.map(
    (c) =>
      `${c.filePath} ${c.functionName ?? ""} ${c.chunkType} ${c.language}\n${c.content}`,
  );

  const textsToEmbed = chunks.map(
    (c) =>
      `File: ${c.filePath}\n${c.functionName ? `Symbol: ${c.functionName}\n` : ""}Type: ${c.chunkType}\nLanguage: ${c.language}\n\n${c.content}`,
  );

  let embeddings: number[][];
  try {
    ({ embeddings } = await embedMany({
      model: embeddingModel,
      values: textsToEmbed,
    }));
  } catch (err) {
    return {
      success: false,
      error: formatServiceError(err, "building local embeddings"),
    };
  }

  preparePineconeForIngest();
  try {
    await upsertChunkVectors(sessionId, chunks, embeddings);
  } catch (err) {
    console.warn("[ingest] Pinecone upsert warning:", err);
  }
  const vectorStore = getSessionVectorStore(sessionId);

  const dependencyGraph = buildDependencyGraph(files);

  createSession({
    id: sessionId,
    repoUrl: repoUrl.trim(),
    repoName: `${parsed.owner}/${parsed.repo}`,
    owner: parsed.owner,
    repo: parsed.repo,
    defaultBranch,
    chunks,
    chunkTexts,
    dependencyGraph,
  });

  return {
    success: true,
    data: {
      sessionId,
      repoName: `${parsed.owner}/${parsed.repo}`,
      filesProcessed: files.length,
      chunksCreated: chunks.length,
      capped,
        capWarning: capped
          ? `Repository exceeded ${MAX_FILES} files. Only the first ${MAX_FILES} files were indexed.`
          : null,
        vectorStore,
      },
    };
}
