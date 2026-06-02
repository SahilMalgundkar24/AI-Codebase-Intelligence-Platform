import { formatServiceError } from "./errors";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "__pycache__",
  ".venv",
  "vendor",
]);

const TEXT_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".rb",
  ".php",
  ".cs",
  ".swift",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".html",
  ".json",
  ".yaml",
  ".yml",
  ".md",
  ".sql",
  ".graphql",
  ".prisma",
  ".toml",
  ".sh",
  ".bash",
  ".dockerfile",
]);

const MAX_FILE_BYTES = 120_000;
const FETCH_TIMEOUT_MS = 30_000;

export type ParsedRepoUrl = {
  owner: string;
  repo: string;
  branch?: string;
};

export function parseGitHubUrl(url: string): ParsedRepoUrl | null {
  try {
    const u = new URL(url.trim());
    if (!u.hostname.replace("www.", "").includes("github.com")) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/, "");
    let branch: string | undefined;
    if (parts[2] === "tree" && parts[3]) {
      branch = parts[3];
    }
    return { owner, repo, branch };
  } catch {
    return null;
  }
}

type TreeItem = { path: string; type: string; size?: number };

function getAuthHeaders(): { api: HeadersInit; raw: HeadersInit; hasToken: boolean } {
  const token = process.env.GITHUB_TOKEN?.trim();
  const api: HeadersInit = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const raw: HeadersInit = {};
  if (token) {
    api.Authorization = `Bearer ${token}`;
    raw.Authorization = `Bearer ${token}`;
  }
  return { api, raw, hasToken: Boolean(token) };
}

function githubApiError(status: number, body: string, step: string): Error {
  if (
    status === 403 &&
    (body.includes("rate limit") || body.includes("API rate limit"))
  ) {
    const hint = process.env.GITHUB_TOKEN?.trim()
      ? "Your GITHUB_TOKEN may be invalid or expired. Create a new classic PAT at https://github.com/settings/tokens (no scopes needed for public repos)."
      : "Add GITHUB_TOKEN to .env.local — a classic Personal Access Token with no scopes is enough for public repos (5,000 requests/hour vs 60 without). Restart `npm run dev` after saving.";
    return new Error(
      `GitHub API rate limit exceeded while ${step}. ${hint}`,
    );
  }
  return new Error(`GitHub API error (${status}) while ${step}: ${body}`);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      next: { revalidate: 0 },
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT_MS / 1000}s: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function githubApiFetch(
  url: string,
  headers: HeadersInit,
  step: string,
): Promise<Response> {
  try {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) {
      throw githubApiError(res.status, await res.text(), step);
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("GitHub API")) {
      throw err;
    }
    throw new Error(formatServiceError(err, step));
  }
}

function rawFileUrl(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): string {
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encoded}`;
}

/**
 * Fetches repo files using ~2 REST API calls (repo + tree), then raw.githubusercontent.com
 * for file bodies — raw URLs do not count against the REST API rate limit.
 */
export async function fetchRepoFiles(
  parsed: ParsedRepoUrl,
  maxFiles: number,
): Promise<{
  files: { path: string; content: string }[];
  defaultBranch: string;
  capped: boolean;
}> {
  const { api: apiHeaders, raw: rawHeaders, hasToken } = getAuthHeaders();

  if (!hasToken) {
    console.warn(
      "[github] GITHUB_TOKEN is not set — only ~60 REST API calls/hour. Add a token to .env.local to avoid rate limits.",
    );
  }

  const repoRes = await githubApiFetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`,
    apiHeaders,
    "loading repository metadata from GitHub",
  );
  const repoMeta = (await repoRes.json()) as { default_branch: string };
  const branch = parsed.branch ?? repoMeta.default_branch;

  const treeRes = await githubApiFetch(
    `https://api.github.com/repos/${parsed.owner}/${parsed.repo}/git/trees/${branch}?recursive=1`,
    apiHeaders,
    "loading file tree from GitHub",
  );
  const treeData = (await treeRes.json()) as { tree: TreeItem[] };

  const LOCKFILES = new Set([
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
  ]);

  const candidates = treeData.tree
    .filter((item) => item.type === "blob")
    .filter((item) => {
      const base = item.path.split("/").pop() ?? item.path;
      if (LOCKFILES.has(base)) return false;
      const parts = item.path.split("/");
      if (parts.some((p) => SKIP_DIRS.has(p))) return false;
      const ext = "." + (item.path.split(".").pop()?.toLowerCase() ?? "");
      if (!TEXT_EXTENSIONS.has(ext) && !item.path.includes("Dockerfile"))
        return false;
      if (item.size && item.size > MAX_FILE_BYTES) return false;
      return true;
    })
    .map((item) => item.path);

  const capped = candidates.length > maxFiles;
  const paths = candidates.slice(0, maxFiles);

  const files: { path: string; content: string }[] = [];
  const concurrency = 12;

  for (let i = 0; i < paths.length; i += concurrency) {
    const batch = paths.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map(async (path) => {
        const content = await fetchFileContentRaw(
          parsed.owner,
          parsed.repo,
          branch,
          path,
          rawHeaders,
          apiHeaders,
        );
        return content ? { path, content } : null;
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) files.push(r.value);
    }
  }

  if (files.length === 0) {
    throw new Error(
      "Could not download any source files. Add GITHUB_TOKEN to .env.local, confirm the repo is public, and retry. " +
        "If you hit rate limits earlier, wait an hour or use a token.",
    );
  }

  return { files, defaultBranch: branch, capped };
}

/** Raw host first (no REST quota); Contents API fallback for edge cases */
async function fetchFileContentRaw(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  rawHeaders: HeadersInit,
  apiHeaders: HeadersInit,
): Promise<string | null> {
  const rawUrl = rawFileUrl(owner, repo, branch, path);
  try {
    const rawRes = await fetchWithTimeout(rawUrl, { headers: rawHeaders });

    if (rawRes.ok) {
      const text = await rawRes.text();
      if (text.length > MAX_FILE_BYTES) return null;
      return text;
    }

    if (rawRes.status === 404 || rawRes.status === 403) {
      return fetchFileContentApi(owner, repo, path, branch, apiHeaders);
    }
  } catch {
    return fetchFileContentApi(owner, repo, path, branch, apiHeaders);
  }

  return null;
}

async function fetchFileContentApi(
  owner: string,
  repo: string,
  path: string,
  ref: string,
  headers: HeadersInit,
): Promise<string | null> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  try {
    const res = await fetchWithTimeout(url, { headers });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      content?: string;
      encoding?: string;
    };
    if (!data.content || data.encoding !== "base64") return null;
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}
