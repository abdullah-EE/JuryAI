import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { comparePostalCounterfactual, counterfactualRiskFlag, runDemoPostalCounterfactual, type DecisionCheckInput } from "../lib/counterfactual";
import { demoCase } from "../lib/demo-case";
import { deliberate } from "../lib/jury";
import { mockFindings } from "../lib/mock-agents";
import { createAgentInputPacket } from "../lib/agents/input-packets";
import { runAgentReview } from "../lib/agents/service";
import type { AgentRunRequest, AgentRunner } from "../lib/agents/runner";
import type { AgentFinding } from "../lib/schemas";

function validOutput<TOutput>(request: AgentRunRequest<TOutput>, recommendation = "Approve"): TOutput {
  return request.outputSchema.parse({
    recommendation,
    confidence: 0.81,
    claims: [{ statement: "Scoped evidence supports this conclusion.", status: "supported" }],
    evidenceReferences: request.inputPacket.evidence.map((item) => item.id),
    risks: [],
    dataUsed: request.inputPacket.evidence.flatMap((item) => item.dataPoints).slice(0, 8),
  });
}

describe("Phase 3 counterfactual fairness and demo resilience", () => {
  it("detects an outcome change when postal geography is neutralized", () => {
    const result = runDemoPostalCounterfactual(demoCase);
    assert.equal(result.baselineRecommendation, "decline");
    assert.equal(result.counterfactualRecommendation, "approve");
    assert.equal(result.changedOutcome, true);
    assert.equal(result.severity, "high");
    assert.match(result.summary, /Counterfactual sensitivity detected/);
    assert.doesNotMatch(result.summary, /bias proven|discriminatory|alternative is unbiased/i);
  });

  it("does not create a false high-severity bias claim when the outcome is unchanged", () => {
    const stableInput: DecisionCheckInput = {
      creditScore: 720,
      debtToIncomeRatio: 0.25,
      monthlyIncomeEur: 6000,
      requestedAmountEur: 12000,
      delayedTransfers: 0,
      documentedMigration: false,
      postalGeography: null,
    };
    const result = comparePostalCounterfactual(stableInput, { ...stableInput, postalGeography: null });
    assert.equal(result.changedOutcome, false);
    assert.equal(result.severity, "low");
    assert.equal(counterfactualRiskFlag(result), null);
  });

  it("passes the structured counterfactual result only to the Bias Challenger", () => {
    const result = runDemoPostalCounterfactual(demoCase);
    const biasPacket = createAgentInputPacket("bias_privacy_challenger", demoCase, result);
    assert.equal(biasPacket.role, "bias_privacy_challenger");
    if (biasPacket.role !== "bias_privacy_challenger") throw new Error("Unexpected packet role");
    assert.deepEqual(biasPacket.counterfactualResult, result);
    assert.deepEqual(biasPacket.evidence.map((item) => item.id), ["EV-05"]);
    const decisionPacket = createAgentInputPacket("decision_witness", demoCase, result);
    assert.equal("counterfactualResult" in decisionPacket, false);
  });

  it("uses the five-second, low-token configuration in demo mode", async () => {
    const seen: AgentRunRequest<unknown>[] = [];
    const runner: AgentRunner = {
      async run<TOutput>(request: AgentRunRequest<TOutput>): Promise<TOutput> {
        seen.push(request as AgentRunRequest<unknown>);
        return validOutput(request);
      },
    };
    await runAgentReview({ runner, useMocks: false, apiKey: "test-key", demoMode: true });
    assert.equal(seen.length, 3);
    assert.ok(seen.every((request) => request.provider.timeoutMs === 5000));
    assert.ok(seen.every((request) => request.provider.maxOutputTokens === 350));
    assert.ok(seen.every((request) => request.correctionAttempt === false));
  });

  it("a failed agent falls back without blocking successful agents", async () => {
    const completed: string[] = [];
    const runner: AgentRunner = {
      async run<TOutput>(request: AgentRunRequest<TOutput>): Promise<TOutput> {
        if (request.role === "fact_checker") throw new Error("simulated failure");
        completed.push(request.role);
        return validOutput(request, `Live ${request.role}`);
      },
    };
    const result = await runAgentReview({ runner, useMocks: false, apiKey: "test-key", demoMode: true });
    assert.equal(result.mode, "fallback");
    assert.deepEqual(completed.sort(), ["bias_privacy_challenger", "decision_witness"]);
    assert.equal(result.findings.find((finding) => finding.role === "decision_witness")?.recommendation, "Live decision_witness");
    assert.equal(result.findings.find((finding) => finding.role === "fact_checker")?.recommendation, mockFindings[1].recommendation);
  });

  it("counterfactual sensitivity deterministically triggers human review", () => {
    const result = runDemoPostalCounterfactual(demoCase);
    const risk = counterfactualRiskFlag(result);
    assert.ok(risk);
    const cleanFindings: AgentFinding[] = mockFindings.map((finding) => ({
      ...finding,
      recommendation: "Approve",
      claims: finding.claims.map((claim) => ({ ...claim, status: "supported" as const })),
      risks: finding.role === "bias_privacy_challenger" ? [risk] : [],
    }));
    assert.equal(deliberate(cleanFindings).recommendation, "human_review");
  });
});
