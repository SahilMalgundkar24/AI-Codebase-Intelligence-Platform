"use server";

import { runIngest } from "@/lib/run-ingest";

/** Prefer POST /api/ingest from the client for long-running repos. */
export async function ingestRepository(repoUrl: string) {
  return runIngest(repoUrl);
}
