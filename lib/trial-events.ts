import { DemoRunResultSchema, ProcessingZoneIdSchema, generateComplianceSummary, type DemoRunResult } from "./compliance";
import { runAgentReview } from "./agents/service";
import { getScenario, ScenarioIdSchema } from "./scenarios";
import type { TrialEventDraft } from "./trial-observer";
import { TrialEventSchema, TrialEventTypeSchema, type TrialEvent } from "./trial-event-schema";
export { TrialEventSchema, TrialEventTypeSchema, type TrialEvent } from "./trial-event-schema";
export type TrialSetup = { scenarioId?: unknown; zoneId?: unknown };

const allowedTypes = new Set(TrialEventTypeSchema.options);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function executeTrialStream(
  setup: TrialSetup,
  send: (event: TrialEvent) => void | Promise<void>,
  options: { pace?: boolean } = {},
): Promise<DemoRunResult> {
  const scenario = getScenario(ScenarioIdSchema.catch("lending").parse(setup.scenarioId));
  const zoneId = ProcessingZoneIdSchema.catch("local_demo").parse(setup.zoneId);
  let sequence = 0;
  const paced = options.pace ?? (process.env.USE_MOCK_AGENTS === "true" || !process.env.OPENAI_API_KEY);
  const emit = async (draft: TrialEventDraft & { result?: DemoRunResult }) => {
    if (!allowedTypes.has(draft.type as (typeof TrialEventTypeSchema.options)[number])) throw new Error(`Unknown trial event ${draft.type}`);
    const event = TrialEventSchema.parse({ ...draft, sequence: ++sequence, timestamp: new Date().toISOString() });
    await send(event);
    if (paced) await wait(380);
  };

  await emit({ type: "trial_started", status: "admitted", details: { caseId: scenario.caseData.id, scenario: scenario.id, processingZone: zoneId } });
  await emit({
    type: "evidence_partitioned", status: "routed", evidenceIds: scenario.caseData.evidence.map((item) => item.id),
    details: { decision_witness: ["EV-01", "EV-02", "EV-03"], fact_checker: ["EV-02", "EV-03", "EV-04"], bias_privacy_challenger: ["EV-05"] },
  });
  const review = await runAgentReview({ caseData: scenario.caseData, observer: emit });
  await emit({ type: "jury_complete", status: "all_votes_sealed", evidenceIds: review.court.casePacket.evidenceReferences });
  await emit({ type: "jury_revealed", status: review.court.juryVerdict.majority, details: { split: review.court.juryVerdict.split, votes: review.court.jurorVotes.map((vote) => `${vote.jurorId}:${vote.vote}`) } });
  for (const trigger of review.court.juryVerdict.safeguardTriggers) await emit({ type: "safeguard_triggered", status: "human_review", risk: trigger });
  await emit({ type: "human_review_required", status: "awaiting_human", summary: "The system has stopped for an accountable human decision." });
  const compliance = generateComplianceSummary(scenario, zoneId, review);
  const result = DemoRunResultSchema.parse({ scenarioId: scenario.id, zoneId, review, compliance });
  await emit({ type: "audit_ready", status: "controls_demonstrated", result });
  await emit({ type: "trial_completed", status: "awaiting_human", mode: review.mode });
  return result;
}
