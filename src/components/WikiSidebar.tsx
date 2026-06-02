"use client";

import type { WikiStructured } from "@/lib/types";
import { type ReactNode, useEffect, useState } from "react";
import { ArchitectureMapModal } from "./ArchitectureMapModal";

type Props = {
  sessionId: string | null;
  repoName: string | null;
  embedded?: boolean;
};

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-[var(--faint)]">
      {children}
    </p>
  );
}

export function WikiSidebar({
  sessionId,
  repoName,
  embedded = false,
}: Props) {
  const [structured, setStructured] = useState<WikiStructured | null>(null);
  const [markdown, setMarkdown] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [archModalOpen, setArchModalOpen] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStructured(null);
      setMarkdown("");
      setStatus(null);
      setError(null);
      setArchModalOpen(false);
      return;
    }

    const abort = new AbortController();
    setArchModalOpen(false);
    setLoading(true);
    setStructured(null);
    setMarkdown("");
    setStatus("Generating wiki…");
    setError(null);

    void (async () => {
      try {
        const res = await fetch("/api/wiki", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
          signal: abort.signal,
        });

        if (!res.ok || !res.body) {
          throw new Error(`Wiki failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!abort.signal.aborted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let payload: {
              type: string;
              structured?: WikiStructured;
              text?: string;
              message?: string;
            };
            try {
              payload = JSON.parse(line.slice(6)) as typeof payload;
            } catch {
              continue;
            }

            if (payload.type === "error" && payload.message) {
              throw new Error(payload.message);
            }
            if (payload.type === "status" && payload.message) {
              setStatus(payload.message);
            }
            if (payload.type === "structured" && payload.structured) {
              setStructured(payload.structured);
              setLoading(false);
            }
            if (payload.type === "delta" && payload.text) {
              setMarkdown((prev) => prev + payload.text);
            }
            if (payload.type === "done") setStatus(null);
          }
        }
      } catch (err) {
        if (abort.signal.aborted) return;
        if (err instanceof Error && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Wiki failed");
        setStatus(null);
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();

    return () => abort.abort();
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="text-sm text-[var(--dim)]">Index a repo first.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {!embedded && (
        <div className="shrink-0 border-b border-[var(--line)] px-6 py-4">
          <p className="font-mono text-xs text-[var(--dim)]">Wiki</p>
          <p className="truncate text-sm">{repoName}</p>
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto py-4 ${embedded ? "px-4" : "px-6 md:px-10"}`}
      >
        <div
          className={`space-y-8 ${embedded ? "" : "mx-auto max-w-2xl"}`}
        >
          {(loading || status) && (
            <p className="font-mono text-xs text-[var(--accent)] animate-pulse">
              {status}
            </p>
          )}
          {error && <p className="text-sm text-red-400/90">{error}</p>}

          {structured && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setArchModalOpen(true)}
                  className="rounded-lg border border-[var(--accent)] bg-[var(--accent-dim)] px-3 py-2 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)] hover:text-[var(--bg)]"
                >
                  View in visual form
                </button>
                <span className="text-[10px] text-[var(--faint)]">
                  Entry points &amp; data flow diagram
                </span>
              </div>

              <ArchitectureMapModal
                open={archModalOpen}
                onClose={() => setArchModalOpen(false)}
                structured={structured}
                repoName={repoName}
              />

              <section>
                <SectionLabel>Stack</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {structured.techStack.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-[var(--accent-dim)] px-2.5 py-1 text-xs text-[var(--accent)]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <SectionLabel>Modules</SectionLabel>
                <ul className="space-y-4">
                  {structured.keyModules.map((m) => (
                    <li
                      key={m.name}
                      className="border-l-2 border-[var(--line)] pl-4"
                    >
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--dim)]">
                        {m.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <SectionLabel>Entry points</SectionLabel>
                <ul className="space-y-3">
                  {structured.entryPoints.map((e) => (
                    <li key={e.path}>
                      <code className="font-mono text-xs text-[var(--accent)]">
                        {e.path}
                      </code>
                      <p className="mt-1 text-sm text-[var(--dim)]">
                        {e.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <SectionLabel>Data flow</SectionLabel>
                <p className="text-sm leading-relaxed text-[var(--dim)]">
                  {structured.dataFlow}
                </p>
              </section>
            </>
          )}

          {markdown && (
            <section className="border-t border-[var(--line)] pt-8">
              <WikiMarkdown content={markdown} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function WikiMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-3 text-sm text-[var(--dim)]">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("## "))
          return (
            <h3 key={i} className="text-base font-medium text-[var(--text)]">
              {line.slice(3)}
            </h3>
          );
        if (line.startsWith("# "))
          return (
            <h2 key={i} className="text-lg font-medium text-[var(--text)]">
              {line.slice(2)}
            </h2>
          );
        if (line.startsWith("- "))
          return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
        if (!line.trim()) return null;
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
