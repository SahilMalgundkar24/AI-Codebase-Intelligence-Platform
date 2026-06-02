import { runIngest } from "@/lib/run-ingest";

export const maxDuration = 300;

export async function POST(req: Request) {
  let repoUrl: string;
  try {
    const body = (await req.json()) as { repoUrl?: string };
    repoUrl = body.repoUrl ?? "";
  } catch {
    return Response.json({ success: false, error: "Invalid JSON body" }, {
      status: 400,
    });
  }

  if (!repoUrl.trim()) {
    return Response.json(
      { success: false, error: "repoUrl is required" },
      { status: 400 },
    );
  }

  const result = await runIngest(repoUrl);
  if (!result.success) {
    console.error("[ingest]", result.error);
  }
  const status = result.success ? 200 : 400;
  return Response.json(result, { status });
}
