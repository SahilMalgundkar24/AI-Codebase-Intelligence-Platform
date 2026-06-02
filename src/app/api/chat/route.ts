import {
  convertToModelMessages,
  streamText,
  type UIMessage,
} from "ai";
import { chatModel } from "@/lib/ai";
import { analyzeDependencyImpact } from "@/lib/dependencies";
import {
  formatContextForPrompt,
  hybridRetrieve,
} from "@/lib/retrieval";
import {
  appendConversationSummary,
  getSession,
  updateSession,
} from "@/lib/session";

export const maxDuration = 120;

async function readChatBody(req: Request): Promise<{
  messages: UIMessage[];
  sessionId: string | null;
}> {
  try {
    const text = await req.text();
    if (!text.trim()) {
      return { messages: [], sessionId: null };
    }
    const body = JSON.parse(text) as {
      messages?: UIMessage[];
      sessionId?: string;
    };
    return {
      messages: body.messages ?? [],
      sessionId: body.sessionId?.trim() ?? null,
    };
  } catch {
    return { messages: [], sessionId: null };
  }
}

export async function POST(req: Request) {
  const { messages, sessionId } = await readChatBody(req);

  if (!sessionId) {
    return Response.json(
      {
        error:
          "Missing sessionId. Re-index the repository and try again (chat was started before a session existed).",
      },
      { status: 400 },
    );
  }

  const session = getSession(sessionId);
  if (!session) {
    return Response.json(
      {
        error:
          "Session not found. Ingest the repository again (dev server restarts clear in-memory sessions).",
      },
      { status: 404 },
    );
  }

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const userText =
    lastUser?.parts
      ?.filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("") ?? "";

  const dependencyResult = analyzeDependencyImpact(
    userText,
    session.chunks,
    session.dependencyGraph,
  );

  const { chunks, traces } = await hybridRetrieve(sessionId, userText);
  updateSession(sessionId, (s) => {
    s.lastTraces = traces;
  });
  const context = formatContextForPrompt(chunks);

  const dependencyBlock = dependencyResult
    ? `\n\nDEPENDENCY IMPACT ANALYSIS (pre-computed from import graph):\n${JSON.stringify(dependencyResult, null, 2)}`
    : "";

  const system = `You are a codebase intelligence assistant for the repository "${session.repoName}" (${session.repoUrl}).

Answer questions in plain English using ONLY the retrieved code context and conversation history. You have full session memory — connect new questions to earlier topics when relevant (e.g. if the user asked about auth before and now asks about middleware, explain how they relate).

CITATION RULES (mandatory):
- Every factual claim about the code MUST include an inline citation in this exact format: [path/to/file.ts:42-58]
- Use the line ranges from the retrieved chunks.
- If you cannot cite a specific file and line range, say you are uncertain.
- Do not invent file paths or line numbers.

When the user asks "what breaks if I change X?", use the dependency impact data provided and explain risks clearly.

CONVERSATION MEMORY:
${session.conversationSummary || "(No prior turns summarized yet)"}

RETRIEVED CODE CONTEXT:
${context}
${dependencyBlock}`;

  const result = streamText({
    model: chatModel,
    system,
    messages: await convertToModelMessages(messages),
    onFinish: async ({ text }) => {
      appendConversationSummary(sessionId, userText, text);
    },
  });

  return result.toUIMessageStreamResponse();
}
