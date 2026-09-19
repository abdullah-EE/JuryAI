import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDemoPostalCounterfactual } from "../lib/counterfactual";
import { buildCasePacket, createEvidenceLedger } from "../lib/court/clerk";
import { buildAllJurorViews, casePacketMaterialSignature, type JurorView } from "../lib/court/juror-views";
import { calculateJuryVerdict } from "../lib/court/jury";
import { runCourtProcess } from "../lib/court/service";
import type { CourtSessionRequest, CourtSessionRunner } from "../lib/court/session-runner";
import { demoCase } from "../lib/demo-case";
import { mockFindings } from "../lib/mock-agents";
import { EvidenceMicroFindingSchema, JurorVoteSchema, type JurorVote } from "../lib/schemas";

const microFindings = demoCase.evidence.map((evidence) => EvidenceMicroFindingSchema.parse({
  evidenceId: evidence.id,
  sourceRole: "evidence_examiner",
  finding: `Finding for ${evidence.id}`,
  supportStatus: evidence.id === "EV-03" ? "disputed" : "verified",
  confidence: 0.85,
  riskType: evidence.id === "EV-05" ? "privacy" : null,
  severity: evidence.id === "EV-05" ? "high" : "none",
}));
const packet = buildCasePacket(createEvidenceLedger(microFindings), mockFindings, runDemoPostalCounterfactual(demoCase));

const viewIds = ["evidence_first", "claim_evidence", "contradiction_first"] as const;
function votes(a: JurorVote["vote"], b: JurorVote["vote"], c: JurorVote["vote"]): JurorVote[] {
  return [a, b, c].map((vote, index) => JurorVoteSchema.parse({ jurorId: `J${index + 1}`, view: viewIds[index], vote, confidence: 0.8, keyEvidenceIds: ["EV-01"], reason: "Structured vote." })) as JurorVote[];
}

function facts(view: JurorView) {
  if (view.view === "evidence_first") return {
    findings: [...view.evidence.verified, ...view.evidence.disputed].map((item) => `${item.evidenceId}|${item.finding}`).sort(),
    risks: view.risks.map((risk) => `${risk.type}|${risk.severity}|${risk.label}`).sort(),
  };
  if (view.view === "claim_evidence") return {
    findings: view.claims.map((item) => `${item.evidenceId}|${item.claim}`).sort(),
    risks: [...new Set([...view.claims.flatMap((item) => item.associatedRisks), ...view.unassociatedRisks].map((risk) => `${risk.type}|${risk.severity}|${risk.label}`))].sort(),
  };
  return {
    findings: [...view.supportingEvidence, ...view.disputedEvidence].map((item) => `${item.evidenceId}|${item.finding}`).sort(),
    risks: view.remainingRisks.map((risk) => `${risk.type}|${risk.severity}|${risk.label}`).sort(),
  };
}

describe("Phase 5 technical hardening", () => {
  it("gives all jurors equivalent underlying admissible facts", () => {
    const views = Object.values(buildAllJurorViews(packet));
    assert.ok(views.every((view) => view.audit.materialSignature === casePacketMaterialSignature(packet)));
    assert.deepEqual(facts(views[0]), facts(views[1]));
    assert.deepEqual(facts(views[1]), facts(views[2]));
  });

  it("uses three different deterministic neutral presentation structures", () => {
    const views = buildAllJurorViews(packet);
    assert.deepEqual([views.J1.view, views.J2.view, views.J3.view], [...viewIds]);
    assert.notDeepEqual(Object.keys(views.J1).sort(), Object.keys(views.J2).sort());
    assert.notDeepEqual(Object.keys(views.J2).sort(), Object.keys(views.J3).sort());
  });

  it("never exposes another juror vote in a juror input", async () => {
    const inputs: string[] = [];
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) {
      if (request.kind === "evidence") return request.outputSchema.parse({ finding: "Scoped fact.", supportStatus: "verified", confidence: 0.8, riskType: null, severity: "none" });
      if (request.kind === "judge_issue") return request.outputSchema.parse({ assessment: "Independent issue.", supportStatus: "unresolved", confidence: 0.8, evidenceIds: ["EV-05"] });
      inputs.push(JSON.stringify(request.input));
      return request.outputSchema.parse({ vote: "overturn", confidence: 0.8, keyEvidenceIds: ["EV-02"], reason: "Evidence supports overturning." });
    } };
    await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false });
    assert.equal(inputs.length, 3);
    assert.ok(inputs.every((input) => !/jurorVotes|jurorId|"vote"|reasoning/i.test(input)));
  });

  it("calculates every two-to-one majority explicitly", () => {
    assert.equal(calculateJuryVerdict(votes("overturn", "overturn", "uphold"), packet).majority, "overturn");
    assert.equal(calculateJuryVerdict(votes("uphold", "uphold", "human_review"), packet).majority, "uphold");
    assert.equal(calculateJuryVerdict(votes("human_review", "human_review", "overturn"), packet).majority, "human_review");
  });

  it("resolves a one-one-one split to human review", () => {
    const verdict = calculateJuryVerdict(votes("uphold", "overturn", "human_review"), packet);
    assert.equal(verdict.majority, "human_review");
    assert.equal(verdict.split, "1–1–1 human_review");
  });

  it("keeps serious safeguards active despite an uphold majority", () => {
    const verdict = calculateJuryVerdict(votes("uphold", "uphold", "overturn"), packet);
    assert.equal(verdict.majority, "uphold");
    assert.equal(verdict.judicialReviewRequired, true);
    assert.ok(verdict.safeguardTriggers.length > 0);
  });

  it("does not add or remove material evidence during view transformation", () => {
    const expected = new Set(packet.evidenceReferences);
    for (const view of Object.values(buildAllJurorViews(packet))) {
      assert.deepEqual(new Set(view.audit.evidenceIds), expected);
      assert.equal(view.audit.findingCount, packet.verifiedFindings.length + packet.disputedFindings.length);
      assert.equal(view.audit.riskCount, packet.riskFlags.length);
    }
  });

  it("falls back cleanly while retaining each juror view audit label", async () => {
    const runner: CourtSessionRunner = { async run() { throw new Error("simulated provider failure"); } };
    const result = await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false, timeoutMs: 5000 });
    assert.equal(result.mode, "fallback");
    assert.deepEqual(result.jurorVotes.map((vote) => vote.view), [...viewIds]);
    assert.equal(result.jurorVotes.length, 3);
  });

  it("caps every court session at the five-second demo timeout", async () => {
    const timeouts: number[] = [];
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) {
      timeouts.push(request.provider.timeoutMs);
      throw new Error("use fallback");
    } };
    await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false, demoMode: true, timeoutMs: 30_000 });
    assert.ok(timeouts.length > 0);
    assert.ok(timeouts.every((timeout) => timeout === 5000));
  });
});
