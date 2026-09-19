import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runDemoPostalCounterfactual } from "../lib/counterfactual";
import { createEvidenceLedger, buildCasePacket } from "../lib/court/clerk";
import { calculateJuryVerdict } from "../lib/court/jury";
import { courtOutputSchemas, runCourtProcess } from "../lib/court/service";
import type { CourtSessionRequest, CourtSessionRunner } from "../lib/court/session-runner";
import { demoCase } from "../lib/demo-case";
import { mockFindings } from "../lib/mock-agents";
import { EvidenceMicroFindingSchema, JurorVoteSchema, type EvidenceMicroFinding, type JurorVote } from "../lib/schemas";

function outputFor<T>(request: CourtSessionRequest<T>): T {
  if (request.kind === "evidence") return request.outputSchema.parse({ finding: "This fragment establishes a scoped fact.", supportStatus: "verified", confidence: 0.8, riskType: null, severity: "none" });
  if (request.kind === "juror") return request.outputSchema.parse({ vote: request.sessionId === "juror-J3" ? "human_review" : "overturn", confidence: 0.8, keyEvidenceIds: ["EV-02"], reason: "Structured evidence challenges the decline." });
  return request.outputSchema.parse({ assessment: "The issue remains material for human review.", supportStatus: "unresolved", confidence: 0.8, evidenceIds: ["EV-05"] });
}

describe("Phase 4 sequential court procedure", () => {
  it("processes evidence fragments in independent fresh inputs", async () => {
    const inputs: unknown[] = [];
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) { if (request.kind === "evidence") inputs.push(request.input); return outputFor(request); } };
    await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false });
    assert.equal(inputs.length, 5);
    assert.equal(new Set(inputs).size, 5);
    for (const input of inputs as Array<{ evidence: { id: string } }>) assert.equal(Object.keys(input).sort().join(","), "evidence,question");
  });

  it("never includes earlier findings in later evidence sessions", async () => {
    const evidenceInputs: unknown[] = [];
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) { if (request.kind === "evidence") evidenceInputs.push(structuredClone(request.input)); return outputFor(request); } };
    await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false });
    assert.ok(evidenceInputs.every((input) => !JSON.stringify(input).match(/finding|previous|verdict/i)));
  });

  it("rejects final verdict fields from micro-session output", () => {
    assert.equal(courtOutputSchemas.evidence.safeParse({ finding: "Fact", supportStatus: "verified", confidence: 0.8, riskType: null, severity: "none", verdict: "overturn" }).success, false);
  });

  it("Clerk only validates, deduplicates, and preserves supplied findings", () => {
    const finding = EvidenceMicroFindingSchema.parse({ evidenceId: "EV-01", sourceRole: "evidence_examiner", finding: "Income is stable.", supportStatus: "verified", confidence: 0.9, riskType: null, severity: "none" });
    const ledger = createEvidenceLedger([finding, structuredClone(finding)]);
    assert.deepEqual(ledger.entries, [finding]);
    assert.equal(ledger.deduplicatedCount, 1);
  });

  it("CasePacket excludes raw evidence and unnecessary applicant data", () => {
    const findings: EvidenceMicroFinding[] = demoCase.evidence.map((evidence) => EvidenceMicroFindingSchema.parse({ evidenceId: evidence.id, sourceRole: "evidence_examiner", finding: "Scoped finding", supportStatus: "verified", confidence: 0.8, riskType: null, severity: "none" }));
    const packet = buildCasePacket(createEvidenceLedger(findings), mockFindings, runDemoPostalCounterfactual(demoCase));
    const serialized = JSON.stringify(packet);
    assert.doesNotMatch(serialized, /Emma Lindholm|00990 Helsinki|monthlyIncomeEur|summary|provider/);
  });

  it("jurors cannot see other juror votes", async () => {
    const inputs: string[] = [];
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) { if (request.kind === "juror") inputs.push(JSON.stringify(request.input)); return outputFor(request); } };
    await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false });
    assert.equal(inputs.length, 3);
    assert.ok(inputs.every((input) => !/jurorId|jurorVotes|"vote"/.test(input)));
  });

  it("produces three independently identified votes", async () => {
    const result = await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { useMocks: true });
    assert.deepEqual(result.jurorVotes.map((vote) => vote.jurorId), ["J1", "J2", "J3"]);
    assert.equal(new Set(result.jurorVotes).size, 3);
  });

  it("calculates the majority and records disagreement", async () => {
    const result = await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { useMocks: true });
    assert.equal(result.juryVerdict.majority, "overturn");
    assert.equal(result.juryVerdict.split, "2–1 overturn");
    assert.equal(result.juryVerdict.disagreement, true);
  });

  it("serious risk requires review despite an unanimous majority", () => {
    const micro = EvidenceMicroFindingSchema.parse({ evidenceId: "EV-05", sourceRole: "evidence_examiner", finding: "Proxy concern", supportStatus: "verified", confidence: 0.9, riskType: "privacy", severity: "high" });
    const packet = buildCasePacket(createEvidenceLedger([micro]), mockFindings, runDemoPostalCounterfactual(demoCase));
    const votes = ["J1", "J2", "J3"].map((jurorId) => JurorVoteSchema.parse({ jurorId, vote: "uphold", confidence: 0.9, keyEvidenceIds: ["EV-05"], reason: "Vote" })) as JurorVote[];
    assert.equal(calculateJuryVerdict(votes, packet).judicialReviewRequired, true);
  });

  it("seals judge issue assessments before verdict exposure", async () => {
    const judgeInputs: string[] = [];
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) { if (request.kind === "judge_issue") judgeInputs.push(JSON.stringify(request.input)); return outputFor(request); } };
    const result = await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false });
    assert.equal(result.procedure.judgeAssessmentsSealedBeforeVerdictExposure, true);
    assert.ok(judgeInputs.every((input) => !/jury|vote|verdict/i.test(input)));
  });

  it("falls back per failed session without blocking the demo", async () => {
    const runner: CourtSessionRunner = { async run<T>(request: CourtSessionRequest<T>) { if (request.sessionId === "evidence-EV-03" || request.sessionId === "juror-J2") throw new Error("fail"); return outputFor(request); } };
    const result = await runCourtProcess(demoCase, mockFindings, runDemoPostalCounterfactual(demoCase), { runner, apiKey: "test", useMocks: false });
    assert.equal(result.mode, "fallback");
    assert.equal(result.ledger.entries.length, 5);
    assert.equal(result.jurorVotes.length, 3);
  });
});

