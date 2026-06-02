export type ChunkType = "function" | "class" | "method" | "module" | "file";

export type CodeChunk = {
  id: string;
  filePath: string;
  functionName: string | null;
  language: string;
  chunkType: ChunkType;
  content: string;
  startLine: number;
  endLine: number;
};

export type RetrievedChunk = CodeChunk & {
  vectorScore: number;
  bm25Score: number;
  combinedScore: number;
};

export type TraceEntry = {
  chunkId: string;
  filePath: string;
  functionName: string | null;
  startLine: number;
  endLine: number;
  vectorScore: number;
  bm25Score: number;
  combinedScore: number;
  preview: string;
};

export type WikiStructured = {
  techStack: string[];
  keyModules: { name: string; description: string }[];
  entryPoints: { path: string; description: string }[];
  dataFlow: string;
};

export type WikiState = {
  structured: WikiStructured | null;
  overviewMarkdown: string;
  isStreaming: boolean;
};

export type VectorStore = "pinecone" | "memory";

export type IngestResult = {
  sessionId: string;
  repoName: string;
  filesProcessed: number;
  chunksCreated: number;
  capped: boolean;
  capWarning: string | null;
  vectorStore: VectorStore;
};

export type DependencyImpact = {
  target: string;
  affectedFiles: {
    path: string;
    risk: "high" | "medium" | "low";
    reason: string;
  }[];
};

export type RepoSession = {
  id: string;
  repoUrl: string;
  repoName: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  chunks: CodeChunk[];
  chunkTexts: string[];
  dependencyGraph: Map<string, Set<string>>;
  wiki: WikiState;
  conversationSummary: string;
  lastTraces: TraceEntry[];
  createdAt: number;
};
