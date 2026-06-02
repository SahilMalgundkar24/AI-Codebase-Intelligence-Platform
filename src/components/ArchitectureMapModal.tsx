"use client";

import type { WikiStructured } from "@/lib/types";
import { useEffect } from "react";
import { RepoArchitectureMap } from "./RepoArchitectureMap";

type Props = {
  open: boolean;
  onClose: () => void;
  structured: WikiStructured;
  repoName?: string | null;
};

export function ArchitectureMapModal({
  open,
  onClose,
  structured,
  repoName,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="arch-map-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close"
      />
      <div className="relative z-10 flex max-h-[min(90vh,820px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--line)] px-4 py-3">
          <div className="min-w-0">
            <h2
              id="arch-map-title"
              className="text-sm font-medium text-[var(--text)]"
            >
              Architecture map
            </h2>
            <p className="mt-0.5 truncate text-xs text-[var(--dim)]">
              {repoName ?? "Repository"} — entry points, routes, and data flow
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--dim)] hover:border-[var(--accent)] hover:text-[var(--text)]"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <RepoArchitectureMap structured={structured} />
        </div>
      </div>
    </div>
  );
}
