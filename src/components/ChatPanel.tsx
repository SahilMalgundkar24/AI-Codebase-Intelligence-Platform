"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { IngestResult } from "@/lib/types";
import { useMemo, useRef, useState } from "react";

const SUGGESTIONS = ["What is the main entry point?"];

type Props = {
  session: IngestResult | null;
};

function CitationText({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+:\d+-\d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[([^:]+):(\d+)-(\d+)\]$/);
        if (m) {
          return (
            <code
              key={i}
              className="mx-0.5 rounded bg-[var(--accent-dim)] px-1 font-mono text-[11px] text-[var(--accent)]"
            >
              {m[1]}:{m[2]}–{m[3]}
            </code>
          );
        }
        return (
          <span key={i} className="whitespace-pre-wrap">
            {part}
          </span>
        );
      })}
    </>
  );
}

export function ChatPanel({ session }: Props) {
  const [input, setInput] = useState("");
  const sessionIdRef = useRef<string | undefined>(session?.sessionId);
  sessionIdRef.current = session?.sessionId;

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        prepareSendMessagesRequest: ({ messages, body }) => ({
          body: { ...body, sessionId: sessionIdRef.current, messages },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    id: session?.sessionId,
  });

  const isLoading = status === "submitted" || status === "streaming";

  if (!session) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-[var(--dim)]">No session.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-xl">
          {session.capWarning && (
            <p className="mb-4 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/80">
              {session.capWarning}
            </p>
          )}
          {error && (
            <p className="mb-4 text-sm text-red-400/90">{error.message}</p>
          )}

          {messages.length === 0 ? (
            <div className="space-y-6 pt-8">
              <p className="text-sm text-[var(--dim)]">
                Ask anything about{" "}
                <span className="text-[var(--text)]">{session.repoName}</span>
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    disabled={isLoading}
                    onClick={() => void sendMessage({ text: q })}
                    className="rounded-lg border border-[var(--line)] px-3 py-2 text-left text-xs text-[var(--dim)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text)] disabled:opacity-40"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-8 pb-4">
              {messages.map((message) => (
                <article key={message.id}>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[var(--faint)]">
                    {message.role}
                  </p>
                  <div
                    className={
                      message.role === "user"
                        ? "rounded-xl bg-[var(--panel)] p-4 text-sm leading-relaxed"
                        : "text-sm leading-relaxed text-[var(--dim)]"
                    }
                  >
                    {message.parts.map((part, i) =>
                      part.type === "text" ? (
                        <div key={`${message.id}-${i}`}>
                          {message.role === "assistant" ? (
                            <CitationText text={part.text} />
                          ) : (
                            <span className="whitespace-pre-wrap text-[var(--text)]">
                              {part.text}
                            </span>
                          )}
                        </div>
                      ) : null,
                    )}
                  </div>
                </article>
              ))}
              {isLoading && (
                <p className="font-mono text-xs text-[var(--accent)] animate-pulse">
                  thinking…
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-[var(--line)] bg-[var(--panel)]/80 px-4 py-3 backdrop-blur">
        <form
          className="mx-auto flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || isLoading) return;
            void sendMessage({ text: input });
            setInput("");
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about the codebase…"
            disabled={isLoading}
            className="h-10 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--bg)] px-3 text-sm focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="h-10 shrink-0 rounded-lg bg-[var(--accent)] px-4 text-sm font-medium text-[var(--bg)] disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
