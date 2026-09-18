import { runAgentReview } from "@/lib/agents/service";

export const runtime = "nodejs";

export async function POST() {
  const result = await runAgentReview();
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}

