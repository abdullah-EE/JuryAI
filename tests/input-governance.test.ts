import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assessAgentSufficiency } from "../lib/agents/sufficiency";
import { runAgentReview } from "../lib/agents/service";
import { runScenarioCounterfactual } from "../lib/counterfactual";
import { applyIdentityFirewall } from "../lib/identity-firewall";
import { scenarios } from "../lib/scenarios";
import { executeTrialStream } from "../lib/trial-events";

describe("Identity firewall and agent sufficiency gates", () => {
  it("pseudonymizes direct identifiers without mutating the raw case", () => {
    const rawCase = structuredClone(scenarios[0].caseData);
    rawCase.evidence[0].summary += ` Applicant ${rawCase.applicant.name} (${rawCase.applicant.id}).`;
    const { safeCase, audit } = applyIdentityFirewall(rawCase);
    assert.equal(rawCase.applicant.name, "Emma Lindholm");
    assert.equal(safeCase.applicant.name, "[REDACTED]");
    assert.notEqual(safeCase.applicant.id, rawCase.applicant.id);
    assert.doesNotMatch(safeCase.evidence[0].summary, /Emma Lindholm|SUB-JAI-LEND-0417/);
    assert.equal(audit.directIdentifiersRemoved, true);
  });

  it("retains the explicitly permitted sensitivity field for the bias review", () => {
    const { safeCase } = applyIdentityFirewall(scenarios[0].caseData);
    assert.equal(safeCase.applicant.postalCode, scenarios[0].caseData.applicant.postalCode);
  });

  it("stops an agent when required evidence is missing", () => {
    const incomplete = structuredClone(scenarios[0].caseData);
    incomplete.evidence = incomplete.evidence.filter((item) => item.id !== "EV-03");
    const assessment = assessAgentSufficiency("decision_witness", incomplete, runScenarioCounterfactual(incomplete));
    assert.equal(assessment.sufficient, false);
    assert.deepEqual(assessment.missingItems, ["EV-03"]);
  });

  it("abstains without starting the agent when the gate fails", async () => {
    const incomplete = structuredClone(scenarios[0].caseData);
    incomplete.evidence = incomplete.evidence.filter((item) => item.id !== "EV-01");
    const events: Array<{ type: string; role?: string; status?: string }> = [];
    const review = await runAgentReview({ caseData: incomplete, useMocks: true, demoMode: true, observer: (event) => { events.push(event); } });
    const decisionFinding = review.findings.find((item) => item.role === "decision_witness");
    assert.match(decisionFinding?.recommendation ?? "", /Insufficient evidence/i);
    assert.equal(events.some((event) => event.type === "witness_started" && event.role === "decision_witness"), false);
    assert.equal(events.some((event) => event.type === "finding_sealed" && event.role === "decision_witness" && event.status === "abstained"), true);
  });

  it("runs the firewall before three visible sufficiency gates", async () => {
    const events: Array<{ type: string; role?: string }> = [];
    await executeTrialStream({ scenarioId: "lending" }, (event) => { events.push(event); }, { pace: false });
    const firewallIndex = events.findIndex((event) => event.type === "identity_firewall_completed");
    const firstGateIndex = events.findIndex((event) => event.type === "sufficiency_gate_checked");
    assert.ok(firewallIndex > 0 && firewallIndex < firstGateIndex);
    assert.deepEqual(events.filter((event) => event.type === "sufficiency_gate_checked").map((event) => event.role).sort(), ["bias_privacy_challenger", "decision_witness", "fact_checker"]);
  });
});
