import type { ChunkType, CodeChunk } from "./types";

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  py: "python",
  go: "go",
  rs: "rust",
  java: "java",
  rb: "ruby",
  php: "php",
  cs: "csharp",
  swift: "swift",
  vue: "vue",
  svelte: "svelte",
};

type BoundaryPattern = {
  type: ChunkType;
  regex: RegExp;
  nameGroup: number;
};

const PATTERNS: Record<string, BoundaryPattern[]> = {
  typescript: [
    {
      type: "class",
      regex:
        /^(export\s+)?(abstract\s+)?class\s+(\w+)[\s\S]*?(?=^(export\s+)?(abstract\s+)?class\s+\w+|^(export\s+)?(async\s+)?function\s+\w+|^export\s+const\s+\w+\s*=|^$)/gm,
      nameGroup: 3,
    },
    {
      type: "function",
      regex:
        /^(export\s+)?(async\s+)?function\s+(\w+)[\s\S]*?(?=^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?class\s+\w+|^export\s+const\s+\w+\s*=|^$)/gm,
      nameGroup: 3,
    },
    {
      type: "function",
      regex:
        /^export\s+const\s+(\w+)\s*=\s*(async\s*)?\([^)]*\)\s*=>[\s\S]*?(?=^export\s+const\s+\w+\s*=|^(export\s+)?(async\s+)?function\s+|^(export\s+)?class\s+\w+|^$)/gm,
      nameGroup: 1,
    },
  ],
  javascript: [
    {
      type: "class",
      regex:
        /^(export\s+)?class\s+(\w+)[\s\S]*?(?=^(export\s+)?class\s+\w+|^(export\s+)?(async\s+)?function\s+\w+|^export\s+const\s+\w+\s*=|^$)/gm,
      nameGroup: 2,
    },
    {
      type: "function",
      regex:
        /^(export\s+)?(async\s+)?function\s+(\w+)[\s\S]*?(?=^(export\s+)?(async\s+)?function\s+\w+|^(export\s+)?class\s+\w+|^export\s+const\s+\w+\s*=|^$)/gm,
      nameGroup: 3,
    },
  ],
  python: [
    {
      type: "class",
      regex: /^class\s+(\w+)[\s\S]*?(?=^class\s+\w+|^def\s+\w+|^async\s+def\s+\w+|^$)/gm,
      nameGroup: 1,
    },
    {
      type: "function",
      regex:
        /^(async\s+)?def\s+(\w+)[\s\S]*?(?=^(async\s+)?def\s+\w+|^class\s+\w+|^$)/gm,
      nameGroup: 2,
    },
  ],
  go: [
    {
      type: "function",
      regex:
        /^func\s+(\([^)]*\)\s+)?(\w+)?\s*\([^)]*\)[\s\S]*?(?=^func\s+|^type\s+\w+\s+|^$)/gm,
      nameGroup: 2,
    },
    {
      type: "class",
      regex: /^type\s+(\w+)\s+struct[\s\S]*?(?=^type\s+\w+|^func\s+|^$)/gm,
      nameGroup: 1,
    },
  ],
};

function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "unknown";
}

function lineNumberAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function chunkFile(
  filePath: string,
  content: string,
  sessionPrefix: string,
): CodeChunk[] {
  const language = detectLanguage(filePath);
  const patterns = PATTERNS[language] ?? PATTERNS.javascript;
  const chunks: CodeChunk[] = [];
  let chunkIndex = 0;

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const block = match[0].trim();
      if (block.length < 20) continue;
      const startLine = lineNumberAt(content, match.index);
      const endLine = startLine + block.split("\n").length - 1;
      const name = match[pattern.nameGroup] ?? null;
      chunks.push({
        id: `${sessionPrefix}-${filePath}-${chunkIndex++}`,
        filePath,
        functionName: name,
        language,
        chunkType: pattern.type,
        content: block,
        startLine,
        endLine,
      });
    }
  }

  if (chunks.length === 0 && content.trim().length > 0) {
    const lines = content.split("\n");
    chunks.push({
      id: `${sessionPrefix}-${filePath}-file`,
      filePath,
      functionName: null,
      language,
      chunkType: "file",
      content: content.slice(0, 12_000),
      startLine: 1,
      endLine: lines.length,
    });
  }

  return chunks;
}

export function chunkRepository(
  files: { path: string; content: string }[],
  sessionId: string,
): CodeChunk[] {
  const all: CodeChunk[] = [];
  for (const file of files) {
    all.push(...chunkFile(file.path, file.content, sessionId));
  }
  return all;
}
