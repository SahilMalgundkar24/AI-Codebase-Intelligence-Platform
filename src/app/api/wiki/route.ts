import { generateText, Output, streamText } from "ai";
import { chatModel } from "@/lib/ai";
import { wikiStructuredSchema } from "@/lib/schemas";
import { getSession, updateWiki } from "@/lib/session";

export const maxDuration = 300;

function sseLine(payload: object): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

async function readSessionId(req: Request): Promise<string | null> {
  try {
    const text = await req.text();
    if (!text.trim()) return null;
    const body = JSON.parse(text) as { sessionId?: string };
    return body.sessionId?.trim() ?? null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const sessionId = await readSessionId(req);

  if (!sessionId) {
    return new Response(sseLine({ type: "error", message: "Missing sessionId" }), {
      status: 400,
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response(
      sseLine({
        type: "error",
        message:
          "Session not found. Re-index the repo (dev server restarts clear in-memory sessions).",
      }),
      { status: 404, headers: { "Content-Type": "text/event-stream" } },
    );
  }

  updateWiki(sessionId, { isStreaming: true, overviewMarkdown: "" });

  const fileList = [
    ...new Set(session.chunks.map((c) => c.filePath)),
  ].slice(0, 80);
  const sampleChunks = session.chunks
    .slice(0, 40)
    .map(
      (c) =>
        `${c.filePath}:${c.startLine}-${c.endLine} ${c.chunkType} ${c.functionName ?? ""}\n${c.content.slice(0, 400)}`,
    )
    .join("\n---\n");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (payload: object) => {
        controller.enqueue(encoder.encode(sseLine(payload)));
      };

      try {
        send({ type: "status", message: "Analyzing architecture…" });

        const { output: structured } = await generateText({
          model: chatModel,
          output: Output.object({ schema: wikiStructuredSchema }),
          prompt: `Analyze this codebase and produce structured architecture metadata.

Repository: ${session.repoName}
Branch: ${session.defaultBranch}
Files (${fileList.length} sampled): ${fileList.join(", ")}

Code samples:
${sampleChunks}`,
        });

        updateWiki(sessionId, { structured });
        send({ type: "structured", structured });

        send({ type: "status", message: "Writing overview…" });

        const result = streamText({
          model: chatModel,
          system: `You write clear technical wiki pages for developers. Use markdown headings.`,
          prompt: `Write an architecture overview wiki page for ${session.repoName}.

Structured analysis already extracted:
${JSON.stringify(structured, null, 2)}

Include:
## Overview
## Tech stack
## Key modules
## Entry points
## Data flow
## Notable patterns

Keep it concise but informative. Reference real file paths from the repo when possible.`,
        });

        let markdown = "";
        for await (const chunk of result.textStream) {
          markdown += chunk;
          updateWiki(sessionId, { overviewMarkdown: markdown });
          send({ type: "delta", text: chunk });
        }

        updateWiki(sessionId, {
          overviewMarkdown: markdown,
          isStreaming: false,
        });
        send({ type: "done" });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Wiki generation failed";
        updateWiki(sessionId, { isStreaming: false });
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
