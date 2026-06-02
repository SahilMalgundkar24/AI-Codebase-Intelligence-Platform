"use client";

import type { IngestResult } from "@/lib/types";
import { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { IngestForm } from "./IngestForm";
import { TracesPanel } from "./TracesPanel";
import { WikiSidebar } from "./WikiSidebar";

function PanelHead({ title }: { title: string }) {
  return (
    <div className="flex shrink-0 items-center border-b border-[var(--line)] bg-[var(--panel)]/50 px-3 py-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--dim)]">
        {title}
      </span>
    </div>
  );
}

export function AppShell() {
  const [session, setSession] = useState<IngestResult | null>(null);
  const [wikiKey, setWikiKey] = useState(0);

  const indexed = Boolean(session);

  function handleIngested(data: IngestResult) {
    setSession(data);
    setWikiKey((k) => k + 1);
  }

  return (
    <div className="relative flex h-full flex-col">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {!indexed ? (
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-20">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--dim)]">
            codebase intelligence
          </p>
          <h1 className="mb-3 max-w-md text-center text-2xl font-light tracking-tight text-[var(--text)] md:text-3xl">
            Understand any repository in plain English
          </h1>
          <div className="w-full max-w-lg">
            <IngestForm variant="hero" onIngested={handleIngested} />
            <p className="mt-4 text-center text-xs leading-relaxed text-[var(--dim)]">
              Public GitHub repos · auto wiki, cited Q&A, retrieval traces
            </p>
          </div>
        </div>
      ) : (
        <>
          <header className="relative z-10 flex shrink-0 items-center justify-between gap-4 border-b border-[var(--line)] bg-[var(--bg)]/80 px-4 py-3 backdrop-blur md:px-5">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm text-[var(--text)]">
                {session!.repoName}
              </p>
              <p className="text-[11px] text-[var(--dim)]">
                {session!.filesProcessed} files · {session!.chunksCreated}{" "}
                chunks · {session!.vectorStore}
              </p>
            </div>
            <IngestForm variant="compact" onIngested={handleIngested} />
          </header>

          <main className="relative z-10 flex min-h-0 flex-1 overflow-hidden">
            <aside className="flex w-[min(34%,360px)] min-w-[220px] flex-col border-r border-[var(--line)]">
              <PanelHead title="Wiki" />
              <div className="min-h-0 flex-1">
                <WikiSidebar
                  key={wikiKey}
                  sessionId={session!.sessionId}
                  repoName={session!.repoName}
                  embedded
                />
              </div>
            </aside>

            <section className="flex min-w-0 flex-1 flex-col">
              <PanelHead title="Chat" />
              <div className="min-h-0 flex-1">
                <ChatPanel session={session} />
              </div>
            </section>

            <aside className="hidden w-[260px] shrink-0 flex-col border-l border-[var(--line)] md:flex">
              <PanelHead title="Traces" />
              <div className="min-h-0 flex-1">
                <TracesPanel sessionId={session!.sessionId} column />
              </div>
            </aside>
          </main>
        </>
      )}
    </div>
  );
}
