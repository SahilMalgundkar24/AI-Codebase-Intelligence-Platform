"use client";

import type { IngestResult } from "@/lib/types";
import { useState } from "react";

type Props = {
  onIngested: (result: IngestResult) => void;
  variant?: "hero" | "compact";
};

type IngestResponse = {
  success?: boolean;
  error?: string;
  data?: IngestResult;
};

function extractError(body: IngestResponse, status: number): string {
  if (body.error) return body.error;
  if (body.success === false) return body.error ?? "Indexing failed";
  return `Request failed (${status})`;
}

export function IngestForm({ onIngested, variant = "hero" }: Props) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const isHero = variant === "hero";

  async function submit() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repoUrl: url }),
      });
      const body = (await res.json().catch(() => ({}))) as IngestResponse;
      if (!res.ok || body.success !== true || !body.data) {
        setError(extractError(body, res.status));
        return;
      }
      onIngested(body.data);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      setError(
        message === "Failed to fetch"
          ? "Cannot reach server — is npm run dev running?"
          : message,
      );
    } finally {
      setPending(false);
    }
  }

  if (isHero) {
    return (
      <div>
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            type="url"
            required
            placeholder="https://github.com/owner/repo"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={pending}
            className="h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 text-sm text-[var(--text)] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !url.trim()}
            className="h-11 w-full rounded-lg bg-[var(--accent)] text-sm font-medium text-[var(--bg)] disabled:opacity-40"
          >
            {pending ? "Indexing…" : "Index repository"}
          </button>
        </form>
        {(pending || error) && (
          <p
            className={`mt-2 text-center text-xs ${
              error ? "text-red-400/90" : "text-[var(--dim)]"
            }`}
          >
            {error ??
              "Fetching files and building embeddings — this can take a minute."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="url"
          required
          placeholder="New repo URL"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          disabled={pending}
          className="h-8 w-44 rounded border border-[var(--line)] bg-[var(--panel)] px-2 text-xs text-[var(--text)] placeholder:text-[var(--faint)] focus:border-[var(--accent)] focus:outline-none md:w-56"
        />
        <button
          type="button"
          disabled={pending || !url.trim()}
          onClick={() => void submit()}
          className="h-8 rounded border border-[var(--line)] px-2.5 text-[11px] text-[var(--dim)] hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-40"
        >
          {pending ? "…" : "Switch"}
        </button>
      </div>
      {error && (
        <p className="max-w-[14rem] text-right text-[10px] text-red-400/90 md:max-w-xs">
          {error}
        </p>
      )}
    </div>
  );
}
