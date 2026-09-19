import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { answerFromTrialRecord, classifyExplanationQuestion } from "../lib/explainability";
import { runAgentReview } from "../lib/agents/service";
import { generateComplianceSummary } from "../lib/compliance";
import { scenarios } from "../lib/scenarios";

describe("Interactive human-review explanations", () => {
  it("maps expected questions to deterministic record intents", () => {
    assert.equal(classifyExplanationQuestion("Why did you recommend overturning?"), "decision_reason");
    assert.equal(classifyExplanationQuestion("Why was the payment-risk claim unsupported?"), "evidence_support");
    assert.equal(classifyExplanationQuestion("What information was hidden from the Bias Challenger?"), "context_access");
    assert.equal(classifyExplanationQuestion("Why did postal geography matter?"), "counterfactual");
    assert.equal(classifyExplanationQuestion("Which juror disagreed and why?"), "jury_disagreement");
    assert.equal(classifyExplanationQuestion("Was identifying information used?"), "privacy");
  });

  it("answers only from the completed structured record with evidence references", async () => {
    const scenario = scenarios[0];
    const review = await runAgentReview({ caseData: scenario.caseData, useMocks: true, demoMode: true });
    const run = { scenarioId: scenario.id, zoneId: "eu_trusted" as const, review, compliance: generateComplianceSummary(scenario, "eu_trusted", review) };
    const answer = answerFromTrialRecord("Why was the payment-risk claim unsupported?", scenario, run, []);
    assert.equal(answer.intent, "evidence_support");
    assert.ok(answer.sources.includes("EV-04"));
    assert.match(answer.paragraphs.join(" "), /account migration/i);
    assert.doesNotMatch(answer.paragraphs.join(" "), /chain.of.thought|step.by.step/i);
  });

  it("refuses questions that the case record cannot answer", async () => {
    const scenario = scenarios[0];
    const review = await runAgentReview({ caseData: scenario.caseData, useMocks: true, demoMode: true });
    const run = { scenarioId: scenario.id, zoneId: "eu_trusted" as const, review, compliance: generateComplianceSummary(scenario, "eu_trusted", review) };
    const answer = answerFromTrialRecord("What is the applicant's favorite color?", scenario, run, []);
    assert.equal(answer.intent, "unknown");
    assert.equal(answer.paragraphs[0], "The current case record does not contain enough evidence to answer that.");
  });
});
