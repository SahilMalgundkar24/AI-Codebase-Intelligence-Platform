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
});

export type WikiStructuredSchema = z.infer<typeof wikiStructuredSchema>;
