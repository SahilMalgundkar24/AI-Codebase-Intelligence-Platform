"use client";

import {
  buildRepoFlowMermaid,
  FLOW_KIND_LEGEND,
} from "@/lib/repo-flow-diagram";
import type { WikiStructured } from "@/lib/types";
import { useEffect, useId, useMemo, useRef, useState } from "react";

type Props = {
  structured: WikiStructured;
};

export function RepoArchitectureMap({ structured }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderId = useId().replace(/:/g, "");
  const [error, setError] = useState<string | null>(null);

  const chart = useMemo(
    () => buildRepoFlowMermaid(structured),
    [structured],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !chart) return;

    let cancelled = false;
    setError(null);
    el.innerHTML = "";

    void (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "strict",
          flowchart: {
            htmlLabels: true,
            curve: "basis",
            padding: 12,
          },
          themeVariables: {
            primaryColor: "#1c1c21",
            primaryTextColor: "#ececee",
            primaryBorderColor: "#8b9cf6",
            lineColor: "#6b6b76",
            tertiaryColor: "#141416",
          },
        });
        const { svg } = await mermaid.render(`repo-flow-${renderId}`, chart);
        if (!cancelled && containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not render diagram",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, renderId]);

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--bg)] p-4">
        <div
          ref={containerRef}
          className="flex min-h-[120px] min-w-[280px] items-center justify-center [&_svg]:max-w-none"
        />
        {error && (
          <p className="mt-2 text-xs text-red-400/90">{error}</p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {FLOW_KIND_LEGEND.map(({ kind, label }) => (
          <span
            key={kind}
            className="font-mono text-[9px] text-[var(--faint)]"
          >
            <span
              className="mr-1 inline-block h-2 w-2 rounded-sm align-middle"
              style={{
                background:
                  kind === "entry"
                    ? "#1e3a5f"
                    : kind === "page"
                      ? "#1a1f2e"
                      : kind === "api"
                        ? "#2a1f3d"
                        : kind === "service"
                          ? "#1f2a22"
                          : kind === "data"
                            ? "#2a2218"
                            : "#1c1c21",
                border: "1px solid var(--accent)",
              }}
            />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
