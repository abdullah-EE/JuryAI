import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runAgentReview } from "../lib/agents/service";
import { generateComplianceSummary, processingZones } from "../lib/compliance";
import { scenarios } from "../lib/scenarios";
import { executeTrialStream } from "../lib/trial-events";

describe("Reusable scenario and governance platform", () => {
  it("defines three scenarios with equivalent evidence contracts", () => {
    assert.deepEqual(scenarios.map((scenario) => scenario.id), ["lending", "hr_screening", "benefits"]);
    for (const scenario of scenarios) assert.deepEqual(scenario.caseData.evidence.map((item) => item.id), ["EV-01", "EV-02", "EV-03", "EV-04", "EV-05"]);
  });
  it("runs every scenario through the same governance engine", async () => {
    for (const scenario of scenarios) {
      const events: Array<{ type: string; role?: string; details?: Record<string, unknown> }> = [];
      const result = await executeTrialStream({ scenarioId: scenario.id, zoneId: "eu_trusted" }, (event) => { events.push(event); }, { pace: false });
      assert.equal(result.review.findings.length, 3);
      assert.equal(result.review.court.jurorVotes.length, 3);
      assert.equal(result.review.court.casePacket.packetId, `CP-${scenario.caseData.id}`);
      assert.equal(events[0].type, "trial_started");
      assert.equal(events.at(-1)?.type, "trial_completed");
      assert.equal(events.filter((event) => event.type === "juror_vote_sealed").length, 3);
      assert.ok(events.findIndex((event) => event.type === "jury_complete") < events.findIndex((event) => event.type === "jury_revealed"));
      assert.equal(result.review.counterfactual.testedField, scenario.sensitivity.field);
    }
  });
  it("generates a complete typed compliance summary", async () => {
    const scenario = scenarios[1];
    const review = await runAgentReview({ caseData: scenario.caseData, useMocks: true, demoMode: true });
    const summary = generateComplianceSummary(scenario, "eu_trusted", review);
    assert.equal(summary.processing_zone, "EU Trusted Zone");
    assert.equal(summary.human_review_required, true);
    assert.deepEqual(summary.evidence_traceability, ["EV-01", "EV-02", "EV-03", "EV-04", "EV-05"]);
    assert.match(summary.sovereignty_note, /simulated/i);
  });
  it("offers four processing-boundary configurations", () => {
    assert.deepEqual(processingZones.map((zone) => zone.id), ["local_demo", "eu_trusted", "us_trusted", "private_enterprise"]);
  });
});
