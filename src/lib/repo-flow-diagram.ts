import type { FlowEdge, FlowNode, WikiStructured } from "./types";

function escapeMermaidLabel(text: string): string {
  return text.replace(/"/g, "'").replace(/[[\]]/g, " ").slice(0, 48);
}

function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

const KIND_STYLES: Record<string, string> = {
  entry: "fill:#1e3a5f,stroke:#8b9cf6,color:#ececee",
  page: "fill:#1a1f2e,stroke:#6b8cce,color:#ececee",
  api: "fill:#2a1f3d,stroke:#a78bfa,color:#ececee",
  service: "fill:#1f2a22,stroke:#6ee7b7,color:#ececee",
  data: "fill:#2a2218,stroke:#fbbf24,color:#ececee",
  module: "fill:#1c1c21,stroke:#6b6b76,color:#ececee",
};

function buildFromFlowGraph(nodes: FlowNode[], edges: FlowEdge[]): string {
  const lines = ["flowchart TD"];
  const ids = new Set<string>();

  for (const node of nodes) {
    const id = safeId(node.id);
    if (ids.has(id)) continue;
    ids.add(id);
    const pathHint = node.filePath
      ? `<br/><small>${escapeMermaidLabel(node.filePath)}</small>`
      : "";
    lines.push(
      `  ${id}["${escapeMermaidLabel(node.label)}${pathHint}"]`,
    );
    const style = KIND_STYLES[node.kind] ?? KIND_STYLES.module;
    lines.push(`  style ${id} ${style}`);
  }

  for (const edge of edges) {
    const from = safeId(edge.from);
    const to = safeId(edge.to);
    if (!ids.has(from) || !ids.has(to)) continue;
    if (edge.label) {
      lines.push(
        `  ${from} -->|"${escapeMermaidLabel(edge.label)}"| ${to}`,
      );
    } else {
      lines.push(`  ${from} --> ${to}`);
    }
  }

  return lines.join("\n");
}

/** Fallback when the model omits flowNodes / flowEdges */
function buildFallbackDiagram(structured: WikiStructured): string {
  const lines = ["flowchart TD"];
  const entryIds: string[] = [];

  structured.entryPoints.forEach((e, i) => {
    const id = `entry_${i}`;
    entryIds.push(id);
    lines.push(`  ${id}["${escapeMermaidLabel(e.path)}"]`);
    lines.push(`  style ${id} ${KIND_STYLES.entry}`);
  });

  const moduleIds: string[] = [];
  structured.keyModules.forEach((m, i) => {
    const id = `module_${i}`;
    moduleIds.push(id);
    lines.push(`  ${id}["${escapeMermaidLabel(m.name)}"]`);
    lines.push(`  style ${id} ${KIND_STYLES.module}`);
  });

  if (entryIds.length && moduleIds.length) {
    lines.push(`  core["App / runtime"]`);
    lines.push(`  style core fill:#141416,stroke:#8b9cf6,color:#ececee`);
    for (const ep of entryIds) lines.push(`  ${ep} --> core`);
    for (const mod of moduleIds) lines.push(`  core --> ${mod}`);
  } else if (entryIds.length > 1) {
    for (let i = 0; i < entryIds.length - 1; i++) {
      lines.push(`  ${entryIds[i]} --> ${entryIds[i + 1]}`);
    }
  }

  return lines.join("\n");
}

export function buildRepoFlowMermaid(structured: WikiStructured): string {
  if (structured.flowNodes?.length && structured.flowEdges?.length) {
    return buildFromFlowGraph(structured.flowNodes, structured.flowEdges);
  }
  if (structured.flowNodes?.length) {
    const sequential: FlowEdge[] = [];
    for (let i = 0; i < structured.flowNodes.length - 1; i++) {
      sequential.push({
        from: structured.flowNodes[i].id,
        to: structured.flowNodes[i + 1].id,
      });
    }
    return buildFromFlowGraph(structured.flowNodes, sequential);
  }
  return buildFallbackDiagram(structured);
}

export const FLOW_KIND_LEGEND: { kind: FlowNode["kind"]; label: string }[] = [
  { kind: "entry", label: "Entry" },
  { kind: "page", label: "Page / route" },
  { kind: "api", label: "API" },
  { kind: "service", label: "Service" },
  { kind: "data", label: "Data" },
  { kind: "module", label: "Module" },
];
