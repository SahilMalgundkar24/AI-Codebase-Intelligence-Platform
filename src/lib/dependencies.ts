import type { CodeChunk, DependencyImpact } from "./types";

const IMPORT_PATTERNS = [
  /import\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+['"]([^'"]+)['"]\s+import/g,
];

function resolveImport(
  importPath: string,
  fromFile: string,
  allPaths: Set<string>,
): string | null {
  if (importPath.startsWith(".")) {
    const dir = fromFile.includes("/")
      ? fromFile.slice(0, fromFile.lastIndexOf("/"))
      : "";
    const joined = `${dir}/${importPath}`.replace(/\/\.\//g, "/");
    const normalized = normalizePath(joined);
    const candidates = [
      normalized,
      `${normalized}.ts`,
      `${normalized}.tsx`,
      `${normalized}.js`,
      `${normalized}.jsx`,
      `${normalized}/index.ts`,
      `${normalized}/index.tsx`,
    ];
    for (const c of candidates) {
      if (allPaths.has(c)) return c;
    }
  }
  return null;
}

function normalizePath(p: string): string {
  const parts = p.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== "." && part) stack.push(part);
  }
  return stack.join("/");
}

export function buildDependencyGraph(
  files: { path: string; content: string }[],
): Map<string, Set<string>> {
  const paths = new Set(files.map((f) => f.path));
  const graph = new Map<string, Set<string>>();

  for (const file of files) {
    const deps = new Set<string>();
    for (const pattern of IMPORT_PATTERNS) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let m: RegExpExecArray | null;
      while ((m = regex.exec(file.content)) !== null) {
        const resolved = resolveImport(m[1], file.path, paths);
        if (resolved) deps.add(resolved);
      }
    }
    graph.set(file.path, deps);
  }

  return graph;
}

export function findDependents(
  graph: Map<string, Set<string>>,
  targetPath: string,
): Map<string, number> {
  const normalized = targetPath.replace(/^\.\//, "");
  const impact = new Map<string, number>();

  function walk(file: string, depth: number) {
    for (const [path, deps] of graph) {
      if (deps.has(file) && path !== file) {
        const prev = impact.get(path) ?? Infinity;
        if (depth < prev) {
          impact.set(path, depth);
          walk(path, depth + 1);
        }
      }
    }
  }

  let resolved = normalized;
  if (!graph.has(resolved)) {
    for (const p of graph.keys()) {
      if (p.endsWith(normalized) || p.includes(normalized)) {
        resolved = p;
        break;
      }
    }
  }

  walk(resolved, 1);
  return impact;
}

export function analyzeDependencyImpact(
  query: string,
  chunks: CodeChunk[],
  graph: Map<string, Set<string>>,
): DependencyImpact | null {
  const match = query.match(
    /what\s+breaks\s+if\s+i\s+change\s+(.+?)\??$/i,
  );
  if (!match) return null;

  const target = match[1].trim().replace(/^['"]|['"]$/g, "");
  const dependents = findDependents(graph, target);

  const affectedFiles = [...dependents.entries()]
    .map(([path, depth]) => {
      let risk: "high" | "medium" | "low" = "low";
      if (depth === 1) risk = "high";
      else if (depth === 2) risk = "medium";
      return {
        path,
        risk,
        reason:
          depth === 1
            ? "Directly imports the target module"
            : `Transitive dependent (hop ${depth})`,
      };
    })
    .sort((a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.risk] - order[b.risk];
    });

  const symbolInChunks = chunks.some(
    (c) =>
      c.functionName?.toLowerCase() === target.toLowerCase() ||
      c.filePath.includes(target),
  );

  if (affectedFiles.length === 0 && !symbolInChunks) {
    return {
      target,
      affectedFiles: [
        {
          path: "(none found)",
          risk: "low",
          reason:
            "No import graph edges found. The symbol may be unused or only referenced dynamically.",
        },
      ],
    };
  }

  return { target, affectedFiles };
}
