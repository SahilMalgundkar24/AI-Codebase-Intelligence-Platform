"use client";

import type { TraceEntry } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type Props = {
  sessionId?: string;
  column?: boolean;
};

export function TracesPanel({ sessionId, column = false }: Props) {
  const [traces, setTraces] = useState<TraceEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTraces = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/traces?sessionId=${encodeURIComponent(sessionId)}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { traces: TraceEntry[] };
        setTraces(data.traces);
      }
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void fetchTraces();
    const id = setInterval(() => void fetchTraces(), 4000);
    return () => clearInterval(id);
  }, [fetchTraces]);

  return (
    <div className="h-full overflow-y-auto px-3 py-3">
      <div className={column ? "" : "mx-auto max-w-2xl"}>
        {!column && (
          <p className="mb-6 text-sm text-[var(--dim)]">
            Hybrid retrieval scores for the latest chat query.
          </p>
        )}

        {loading && traces.length === 0 && (
          <p className="font-mono text-xs text-[var(--faint)]">Loading…</p>
        )}

        {!loading && traces.length === 0 && (
          <p className="text-xs leading-relaxed text-[var(--dim)]">
            Ask something in chat — traces appear here after retrieval runs.
          </p>
        )}

        <ul className="space-y-2">
          {traces.map((t, i) => (
            <li
              key={t.chunkId}
              className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-[var(--faint)]">
                  #{i + 1}
                </span>
                <span className="font-mono text-sm text-[var(--accent)]">
                  {(t.combinedScore * 100).toFixed(0)}%
                </span>
              </div>
              <p className="truncate font-mono text-xs text-[var(--text)]">
                {t.filePath}:{t.startLine}–{t.endLine}
              </p>
              {t.functionName && (
                <p className="mt-1 text-xs text-[var(--dim)]">
                  {t.functionName}
                </p>
              )}
              <div className="mt-3 flex gap-4 font-mono text-[10px] text-[var(--faint)]">
                <span>vec {t.vectorScore.toFixed(3)}</span>
                <span>bm25 {t.bm25Score.toFixed(3)}</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--dim)]">
                {t.preview}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
