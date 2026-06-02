import { z } from "zod";

export const wikiStructuredSchema = z.object({
  techStack: z.array(z.string()).describe("Detected frameworks, languages, and tools"),
  keyModules: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
      }),
    )
    .describe("Important directories or modules"),
  entryPoints: z
    .array(
      z.object({
        path: z.string(),
        description: z.string(),
      }),
    )
    .describe("Main entry files like index, main, app router"),
  dataFlow: z
    .string()
    .describe("Plain-English explanation of how data moves through the app"),
  flowNodes: z
    .array(
      z.object({
        id: z.string().describe("Short unique id, e.g. entry_main"),
        label: z.string().describe("Display name"),
        kind: z.enum([
          "entry",
          "page",
          "api",
          "service",
          "data",
          "module",
        ]),
        filePath: z.string().optional(),
      }),
    )
    .describe(
      "5–12 nodes for an architecture diagram: entries, pages/routes, APIs, services, data stores",
    ),
  flowEdges: z
    .array(
      z.object({
        from: z.string().describe("flowNodes id"),
        to: z.string().describe("flowNodes id"),
        label: z
          .string()
          .optional()
          .describe("e.g. HTTP, props, query, event"),
      }),
    )
    .describe("Directed edges showing how control or data moves between nodes"),
});

export type WikiStructuredSchema = z.infer<typeof wikiStructuredSchema>;
