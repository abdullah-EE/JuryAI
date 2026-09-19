import { runAgentReview } from "@/lib/agents/service";
import { generateComplianceSummary, ProcessingZoneIdSchema } from "@/lib/compliance";
import { getScenario, ScenarioIdSchema } from "@/lib/scenarios";
import { z } from "zod";

export const runtime = "nodejs";

const RequestSchema = z.object({
  scenarioId: ScenarioIdSchema.default("lending"),
  zoneId: ProcessingZoneIdSchema.default("local_demo"),
}).strict();

export async function POST(request: Request) {
  let payload: unknown = {};
  try { payload = await request.json(); } catch { /* Empty body uses demo defaults. */ }
  const setup = RequestSchema.parse(payload);
  const scenario = getScenario(setup.scenarioId);
  const review = await runAgentReview({ caseData: scenario.caseData });
  const compliance = generateComplianceSummary(scenario, setup.zoneId, review);
  return Response.json({ scenarioId: scenario.id, zoneId: setup.zoneId, review, compliance }, { headers: { "Cache-Control": "no-store" } });
}
