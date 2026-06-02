import type { RepoSession, WikiState } from "./types";

const globalForSessions = globalThis as unknown as {
  __codeIntelSessions?: Map<string, RepoSession>;
};

function getStore(): Map<string, RepoSession> {
  if (!globalForSessions.__codeIntelSessions) {
    globalForSessions.__codeIntelSessions = new Map();
  }
  return globalForSessions.__codeIntelSessions;
}

export function createSession(
  partial: Omit<
    RepoSession,
    "wiki" | "conversationSummary" | "createdAt" | "lastTraces"
  >,
): RepoSession {
  const session: RepoSession = {
    ...partial,
    wiki: {
      structured: null,
      overviewMarkdown: "",
      isStreaming: false,
    },
    conversationSummary: "",
    lastTraces: [],
    createdAt: Date.now(),
  };
  getStore().set(session.id, session);
  return session;
}

export function getSession(id: string): RepoSession | undefined {
  return getStore().get(id);
}

export function updateSession(
  id: string,
  updater: (session: RepoSession) => void,
): RepoSession | undefined {
  const session = getStore().get(id);
  if (!session) return undefined;
  updater(session);
  getStore().set(id, session);
  return session;
}

export function updateWiki(id: string, wiki: Partial<WikiState>): void {
  updateSession(id, (s) => {
    s.wiki = { ...s.wiki, ...wiki };
  });
}

export function appendConversationSummary(
  id: string,
  userMessage: string,
  assistantSummary: string,
): void {
  updateSession(id, (s) => {
    const line = `User: ${userMessage.slice(0, 200)}\nAssistant: ${assistantSummary.slice(0, 400)}`;
    s.conversationSummary = [s.conversationSummary, line]
      .filter(Boolean)
      .join("\n\n")
      .slice(-8000);
  });
}
