/**
 * JuryAI — Blind / Compartmentalized Testimony Tests
 *
 * Core guarantee: each AI role receives ONLY the minimum context required for
 * its job and must NOT receive other agents' initial conclusions.
 *
 * These tests operate on the real mock fixtures and schema types so that any
 * regression in the data or schema propagates as a test failure immediately.
 *
 * IMPORTANT — what changed from the previous version:
 *   Compartmentalization rules are now verified through the structured
 *   `inputManifest` field (AgentInputManifestSchema), NOT through substring
 *   matching on the free-text `sealedInputDescription`. The description string
 *   is for UI display only and must never be treated as a security boundary.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { demoCase } from "../lib/demo-case";
import { mockFindings } from "../lib/mock-agents";
import { deliberate } from "../lib/jury";
import { generateReport } from "../lib/report";
import {
  AgentFindingSchema,
} from "../lib/schemas";
import type {
  AgentFinding,
  AgentInputManifest,
  Case,
  EvidenceSource,
  RiskFlag,
} from "../lib/schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the finding for a specific role (throws if absent so tests fail clearly). */
function findingFor(role: AgentFinding["role"]): AgentFinding {
  const f = mockFindings.find((a) => a.role === role);
  assert.ok(f, `No finding for role "${role}" — fixture is missing`);
  return f;
}

/** Build a quick lookup by evidence id from the case. */
function buildEvidenceIndex(c: Case): Map<string, EvidenceSource> {
  return new Map(c.evidence.map((e) => [e.id, e]));
}

/** Assert that a manifest does NOT grant access to a specific evidence id. */
function assertEvidenceNotGranted(
  manifest: AgentInputManifest,
  evidenceId: string,
  message: string,
): void {
  assert.equal(
    manifest.allowedEvidenceIds.includes(evidenceId),
    false,
    `${message} — manifest grants access to "${evidenceId}" which it should not`,
  );
}

/** Assert that a manifest does NOT grant access to a specific data category. */
function assertCategoryNotGranted(
  manifest: AgentInputManifest,
  category: AgentInputManifest["allowedDataCategories"][number],
  message: string,
): void {
  assert.equal(
    manifest.allowedDataCategories.includes(category),
    false,
    `${message} — manifest grants access to category "${category}" which it should not`,
  );
}

// ---------------------------------------------------------------------------
// Test 1 — Fact Checker — structured manifest checks
// ---------------------------------------------------------------------------
describe("Fact Checker — blind compartmentalization (manifest-based)", () => {
  /**
   * WHY THIS MATTERS:
   * The Fact Checker's job is to independently verify whether specific claims
   * made by the initial decision model are factually supported by evidence.
   * Feeding it the applicant's demographic profile or another agent's
   * recommendation would allow those signals to anchor its analysis,
   * destroying the "blind" guarantee. All rules are now enforced through the
   * structured inputManifest — not inferred from prose strings.
   */
  const fc = findingFor("fact_checker");
  const manifest = fc.inputManifest;
  const evidenceIndex = buildEvidenceIndex(demoCase);

  it("manifest.purpose must be 'claim_verification'", () => {
    assert.equal(
      manifest.purpose,
      "claim_verification",
      "Fact Checker manifest has wrong purpose — must be 'claim_verification'",
    );
  });

  it("manifest.receivesOtherAgentFindings must be false", () => {
    /**
     * This is the primary cross-contamination guard. The field is typed as
     * z.literal(false) in the schema so Zod already rejects any other value,
     * but the test makes the invariant explicit and visible in CI output.
     */
    assert.equal(
      manifest.receivesOtherAgentFindings,
      false,
      "Fact Checker manifest declares it receives other agents' findings — compartmentalization violated",
    );
  });

  it("manifest.prohibitedContextTypes must include 'other_agent_findings' and 'jury_conclusions'", () => {
    /**
     * The prohibition list is the machine-readable version of "this agent
     * operates in isolation." Both cross-agent leaks and jury pre-knowledge
     * must be explicitly forbidden.
     */
    assert.ok(
      manifest.prohibitedContextTypes.includes("other_agent_findings"),
      "Fact Checker manifest does not prohibit 'other_agent_findings'",
    );
    assert.ok(
      manifest.prohibitedContextTypes.includes("jury_conclusions"),
      "Fact Checker manifest does not prohibit 'jury_conclusions'",
    );
  });

  it("manifest must grant access to at least one substantive financial/contextual evidence source", () => {
    /**
     * A Fact Checker that cannot access the evidence cited by the model
     * cannot verify anything. It must have at least one non-applicant source.
     */
    const substantiveCategories: AgentInputManifest["allowedDataCategories"] =
      ["income", "credit", "banking", "context"];
    const hasSubstantive = manifest.allowedDataCategories.some((cat) =>
      substantiveCategories.includes(cat),
    );
    assert.ok(
      hasSubstantive,
      "Fact Checker manifest grants no access to financial/contextual evidence categories",
    );
  });

  it("manifest must NOT grant access to the 'applicant' category", () => {
    /**
     * The applicant evidence category (EV-05) contains demographics including
     * postal code, age, and name. The Fact Checker has no need for these when
     * verifying a payment-instability claim against bank records.
     */
    assertCategoryNotGranted(
      manifest,
      "applicant",
      "Fact Checker manifest",
    );
  });

  it("manifest must NOT list any sensitive applicant fields", () => {
    /**
     * Name, age, and postalCode are never required to verify whether a
     * banking claim is factually accurate. An empty allowedSensitiveFields
     * array is the correct least-privilege value for this role.
     */
    assert.equal(
      manifest.allowedSensitiveFields.length,
      0,
      `Fact Checker manifest grants access to sensitive fields: [${manifest.allowedSensitiveFields.join(", ")}]`,
    );
  });

  it("manifest.allowedEvidenceIds must not include the applicant profile (EV-05)", () => {
    /**
     * EV-05 is the applicant profile document containing name, age, postal
     * code, and declared purpose. It must not appear in the Fact Checker's
     * allow-list because demographic data is irrelevant to claim verification.
     */
    assertEvidenceNotGranted(manifest, "EV-05", "Fact Checker manifest");
  });

  it("all evidenceReferences must be within manifest.allowedEvidenceIds (schema refine enforcement)", () => {
    /**
     * The AgentFindingSchema refine() rule enforces this at parse time.
     * This test makes the runtime property visible as a CI assertion and
     * would catch any manual fixture bypass that skips Zod parsing.
     */
    for (const ref of fc.evidenceReferences) {
      assert.ok(
        manifest.allowedEvidenceIds.includes(ref),
        `Fact Checker evidenceReference "${ref}" is not in its manifest.allowedEvidenceIds`,
      );
    }
  });

  it("every allowed evidence ID must exist in the case evidence index", () => {
    /**
     * Referencing a non-existent evidence ID would be a data error that
     * could mask an agent silently receiving no evidence at all.
     */
    for (const id of manifest.allowedEvidenceIds) {
      assert.ok(
        evidenceIndex.has(id),
        `Fact Checker manifest references unknown evidence "${id}"`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Bias & Privacy Challenger — least-privilege evidence access
// ---------------------------------------------------------------------------
describe("Bias & Privacy Challenger — least-privilege evidence access (manifest-based)", () => {
  /**
   * WHY THIS MATTERS:
   * The Bias & Privacy Challenger tests whether the outcome depends on
   * protected attributes or unnecessary data. It needs the model's input
   * labels and the evidence source that contains the protected attribute
   * (EV-05 — applicant profile with postalCode). It does NOT need the
   * underlying financial documents (EV-01/02/03) because those are inputs
   * to the model, not the subject of the fairness test. Granting unnecessary
   * financial document access violates the least-privilege principle and
   * could allow the challenger to reason about financial merit rather than
   * attribute-based outcomes.
   */
  const bpc = findingFor("bias_privacy_challenger");
  const manifest = bpc.inputManifest;

  it("manifest.purpose must be 'fairness_privacy_audit'", () => {
    assert.equal(
      manifest.purpose,
      "fairness_privacy_audit",
      "Bias Challenger manifest has wrong purpose",
    );
  });

  it("manifest.receivesOtherAgentFindings must be false", () => {
    assert.equal(
      manifest.receivesOtherAgentFindings,
      false,
      "Bias Challenger manifest declares it receives other agents' findings",
    );
  });

  it("manifest.prohibitedContextTypes must include 'other_agent_findings'", () => {
    assert.ok(
      manifest.prohibitedContextTypes.includes("other_agent_findings"),
      "Bias Challenger manifest does not prohibit 'other_agent_findings'",
    );
  });

  it("manifest must NOT grant access to financial evidence categories (income, credit, banking)", () => {
    /**
     * The key least-privilege fix: a fairness audit only needs the attribute
     * under scrutiny plus model metadata. Granting income, credit, or banking
     * evidence access gives the Bias Challenger unnecessary raw financial data.
     */
    for (const cat of ["income", "credit", "banking"] as const) {
      assertCategoryNotGranted(manifest, cat, "Bias Challenger manifest");
    }
  });

  it("manifest must NOT grant access to financial evidence documents (EV-01, EV-02, EV-03)", () => {
    /**
     * Individual evidence allow-list check — belt-and-suspenders alongside
     * the category check above. Both must pass for the least-privilege fix
     * to be complete.
     */
    for (const id of ["EV-01", "EV-02", "EV-03"]) {
      assertEvidenceNotGranted(manifest, id, "Bias Challenger manifest");
    }
  });

  it("manifest must grant access to the applicant profile evidence (EV-05)", () => {
    /**
     * EV-05 contains postalCode — the protected attribute under test. The
     * challenger must have it to run the counterfactual. Removing it would
     * make the fairness audit impossible, violating the principle that
     * compartmentalization must not reduce decision quality.
     */
    assert.ok(
      manifest.allowedEvidenceIds.includes("EV-05"),
      "Bias Challenger manifest does not grant access to EV-05 (applicant profile with postal code)",
    );
  });

  it("manifest must explicitly permit 'postalCode' as an allowed sensitive field", () => {
    /**
     * postalCode is a protected demographic attribute. By requiring it to be
     * explicitly listed in allowedSensitiveFields, the manifest creates an
     * auditable record that the challenger's access to this attribute was
     * intentional and documented — not incidental.
     */
    assert.ok(
      manifest.allowedSensitiveFields.includes("postalCode"),
      "Bias Challenger manifest does not list 'postalCode' in allowedSensitiveFields",
    );
  });

  it("manifest must NOT permit 'name' or 'age' as sensitive fields (not required for counterfactual)", () => {
    /**
     * The counterfactual test is specifically about postalCode. The applicant's
     * name and age serve no purpose for a fairness audit and must not be
     * granted access under the least-privilege rule.
     */
    assert.equal(
      manifest.allowedSensitiveFields.includes("name"),
      false,
      "Bias Challenger manifest grants access to 'name' — not required for fairness audit",
    );
    assert.equal(
      manifest.allowedSensitiveFields.includes("age"),
      false,
      "Bias Challenger manifest grants access to 'age' — not required for fairness audit",
    );
  });

  it("all evidenceReferences must be within manifest.allowedEvidenceIds", () => {
    for (const ref of bpc.evidenceReferences) {
      assert.ok(
        manifest.allowedEvidenceIds.includes(ref),
        `Bias Challenger evidenceReference "${ref}" is not in its manifest.allowedEvidenceIds`,
      );
    }
  });

  it("must flag a bias or privacy risk (counterfactual observed a location-proxy dependency)", () => {
    /**
     * After applying least-privilege, the challenger should still have enough
     * context to detect the postal-proxy outcome dependency. If this test
     * fails, least-privilege has been applied too aggressively.
     */
    const locationRisk = bpc.risks.find(
      (r) => r.type === "bias" || r.type === "privacy",
    );
    assert.ok(
      locationRisk,
      "Bias Challenger raised no bias/privacy risk — but a location proxy was detected in the demo case",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Decision Witness — isolation and correct scope
// ---------------------------------------------------------------------------
describe("Decision Witness — initial testimony isolation (manifest-based)", () => {
  /**
   * WHY THIS MATTERS:
   * Witnesses give independent testimony. Cross-contamination (agent B seeing
   * agent A's output during initial testimony) undermines the entire point of
   * multi-agent deliberation. The manifest makes isolation machine-checkable.
   */
  const dw = findingFor("decision_witness");
  const manifest = dw.inputManifest;

  it("manifest.purpose must be 'eligibility_assessment'", () => {
    assert.equal(
      manifest.purpose,
      "eligibility_assessment",
      "Decision Witness manifest has wrong purpose",
    );
  });

  it("manifest.receivesOtherAgentFindings must be false", () => {
    assert.equal(
      manifest.receivesOtherAgentFindings,
      false,
      "Decision Witness manifest declares it receives other agents' findings",
    );
  });

  it("manifest.prohibitedContextTypes must include 'other_agent_findings'", () => {
    assert.ok(
      manifest.prohibitedContextTypes.includes("other_agent_findings"),
      "Decision Witness manifest does not prohibit 'other_agent_findings'",
    );
  });

  it("manifest must NOT grant access to the 'applicant' evidence category", () => {
    /**
     * The Decision Witness assesses financial eligibility only. The applicant
     * profile (EV-05, containing demographics) is not required. Including it
     * would expose postalCode and age, enabling the witness to reason about
     * attributes rather than financial merit.
     */
    assertCategoryNotGranted(manifest, "applicant", "Decision Witness manifest");
  });

  it("manifest must NOT list any sensitive applicant fields", () => {
    assert.equal(
      manifest.allowedSensitiveFields.length,
      0,
      `Decision Witness manifest grants access to sensitive fields: [${manifest.allowedSensitiveFields.join(", ")}]`,
    );
  });

  it("all three agents have distinct manifest purposes", () => {
    /**
     * Each role has a different job — the manifest purpose field must be
     * distinct for all three. Identical purposes would indicate copy-paste
     * errors or collapsed roles.
     */
    const purposes = new Set(mockFindings.map((f) => f.inputManifest.purpose));
    assert.equal(
      purposes.size,
      3,
      "Two or more agents share the same manifest.purpose — each role must have a distinct purpose",
    );
  });

  it("no two agents share identical manifest.allowedEvidenceIds sets", () => {
    /**
     * Each agent should have a meaningfully different evidence access set.
     * Identical sets suggest roles are not actually compartmentalized.
     */
    const serialised = mockFindings.map((f) =>
      JSON.stringify([...f.inputManifest.allowedEvidenceIds].sort()),
    );
    const unique = new Set(serialised);
    assert.equal(
      unique.size,
      mockFindings.length,
      "Two or more agents have identical allowedEvidenceIds — compartmentalization boundary is not enforced",
    );
  });

  it("Decision Witness manifest does not grant access to model-input labels (Bias Challenger scope only)", () => {
    /**
     * 'Model input labels' are needed by the Bias Challenger for counterfactual
     * tests. The Decision Witness has no legitimate reason to see them — doing
     * so would let the witness reason about the model architecture.
     * We verify this through purpose (eligibility_assessment) and the absence
     * of the applicant category rather than data-field names, since dataUsed
     * is a human-readable list, not a validated manifest field.
     */
    assert.equal(
      manifest.purpose,
      "eligibility_assessment",
      "Decision Witness manifest purpose should be eligibility_assessment, not a fairness audit",
    );
    assertCategoryNotGranted(manifest, "applicant", "Decision Witness manifest");
  });
});

// ---------------------------------------------------------------------------
// Test 4 — Jury deliberation — input/output contract
// ---------------------------------------------------------------------------
describe("Jury deliberation — input contract and output integrity", () => {
  /**
   * WHY THIS MATTERS:
   * The jury aggregates structured AgentFinding objects — not raw applicant
   * records or chain-of-thought reasoning. Leaking raw applicant data into
   * the jury stage bypasses the compartmentalization enforced at the agent
   * level. The jury should only see what each agent chose to surface.
   */
  const juryResult = deliberate(mockFindings);

  it("deliberate() accepts AgentFinding[] and returns a valid JuryResult", () => {
    assert.ok(juryResult, "deliberate() returned null/undefined");
    assert.ok(typeof juryResult.recommendation === "string", "JuryResult.recommendation missing");
    assert.ok(typeof juryResult.confidence === "number", "JuryResult.confidence missing");
  });

  it("jury risk flags must be traceable to a sourceAgentId from agent findings", () => {
    /**
     * Each risk flag in the jury result must be traceable to an agentId.
     * A flag without a sourceAgentId would mean the jury is injecting its
     * own judgments — bypassing agent testimony entirely.
     */
    const allFlags: RiskFlag[] = mockFindings.flatMap((f) => f.risks);
    for (const flag of juryResult.riskFlags) {
      const matched = allFlags.find((af) => af.id === flag.id);
      assert.ok(
        matched,
        `Jury riskFlag "${flag.id}" does not exist in any AgentFinding — jury may be injecting synthetic flags`,
      );
      assert.ok(
        flag.sourceAgentId,
        `Risk flag "${flag.id}" has no sourceAgentId — provenance cannot be audited`,
      );
    }
  });

  it("jury result must NOT contain raw applicant PII", () => {
    /**
     * The JuryResult schema contains recommendation, confidence, agreements,
     * disagreements, unsupportedClaims, riskFlags, evidenceQuality, and
     * rationale. None of these should embed the raw applicant record.
     */
    const serialised = JSON.stringify(juryResult);
    const piiMarkers = [
      demoCase.applicant.name,
      demoCase.applicant.id,
      String(demoCase.applicant.age),
    ];
    for (const marker of piiMarkers) {
      assert.equal(
        serialised.includes(marker),
        false,
        `JuryResult contains raw applicant data: "${marker}"`,
      );
    }
  });

  it("jury result must articulate both agreements and disagreements", () => {
    assert.ok(juryResult.agreements.length > 0, "Jury produced no agreements");
    assert.ok(juryResult.disagreements.length > 0, "Jury produced no disagreements");
  });

  it("all agent findings passed to deliberate() carry valid inputManifests", () => {
    /**
     * The jury receives AgentFinding objects. Every finding must carry its
     * inputManifest so that the jury stage can, in principle, verify that
     * each testimony was produced under the correct compartmentalization rules.
     */
    for (const finding of mockFindings) {
      assert.ok(
        finding.inputManifest,
        `Finding "${finding.agentId}" is missing its inputManifest`,
      );
      assert.equal(
        finding.inputManifest.receivesOtherAgentFindings,
        false,
        `Finding "${finding.agentId}" inputManifest claims it received other agents' findings`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Risk-severity escalation — majority agreement must not suppress flags
// ---------------------------------------------------------------------------
describe("Risk-severity escalation — majority agreement must not suppress serious flags", () => {
  /**
   * WHY THIS MATTERS:
   * A naive majority-vote system would approve a decision when two out of
   * three agents agree. JuryAI's guarantee is that a single high-severity
   * factual, bias, privacy, or sovereignty flag forces escalation to human
   * review — vote count is irrelevant. This prevents safety theatre where
   * unanimous-but-wrong agreement hides a critical problem.
   */

  it("a single high-severity risk flag triggers human_review even if all agents recommend approve", () => {
    const unanimousApproval: AgentFinding[] = mockFindings.map((f) => ({
      ...f,
      recommendation: "Approve",
      risks: [],
    }));

    const highSeverityFlag: RiskFlag = {
      id: "RF-TEST-01",
      type: "factual",
      severity: "high",
      title: "Test: fabricated factual error",
      description: "Injected for test — simulates a high-severity factual discrepancy.",
      sourceAgentId: "AG-DECISION-01",
      evidenceReferences: ["EV-01"],
    };

    const findingsWithOneFlag: AgentFinding[] = [
      { ...unanimousApproval[0], risks: [highSeverityFlag] },
      unanimousApproval[1],
      unanimousApproval[2],
    ];

    const result = deliberate(findingsWithOneFlag);
    assert.equal(
      result.recommendation,
      "human_review",
      "A high-severity flag was ignored — majority agreement must NOT suppress escalation",
    );
  });

  it("a single critical risk flag also triggers human_review", () => {
    const minimalFindings: AgentFinding[] = mockFindings.map((f) => ({
      ...f,
      recommendation: "Approve",
      risks: [],
      claims: [],
    }));

    const criticalFlag: RiskFlag = {
      id: "RF-TEST-02",
      type: "sovereignty",
      severity: "critical",
      title: "Test: critical sovereignty risk",
      description: "Data residency requirement violated — injected for test.",
      sourceAgentId: "AG-BIAS-01",
      evidenceReferences: [],
    };

    const findingsWithCritical: AgentFinding[] = [
      minimalFindings[0],
      { ...minimalFindings[1], risks: [criticalFlag] },
      minimalFindings[2],
    ];

    const result = deliberate(findingsWithCritical);
    assert.equal(
      result.recommendation,
      "human_review",
      "A critical flag was ignored — any critical risk must force human review",
    );
  });

  it("no high/critical flags AND no unsupported claims → approve is acceptable", () => {
    /**
     * Sanity-check the inverse: when there are genuinely no serious risks and
     * all claims are supported, the system should NOT escalate unnecessarily.
     * Unnecessary escalation is also a failure mode (alert fatigue).
     */
    const cleanFindings: AgentFinding[] = mockFindings.map((f) => ({
      ...f,
      risks: [],
      claims: f.claims.map((c) => ({ ...c, status: "supported" as const })),
    }));

    const result = deliberate(cleanFindings);
    assert.equal(
      result.recommendation,
      "approve",
      "With no risk flags and no unsupported claims, deliberate() should recommend approve",
    );
  });

  it("three-way agreement does not suppress a high-severity bias flag", () => {
    /**
     * Three-agent unanimous approval with one embedded high-severity flag.
     * The flag must win over the vote.
     */
    const biasFlag: RiskFlag = {
      id: "RF-TEST-03",
      type: "bias",
      severity: "high",
      title: "Test: location-proxy bias flag",
      description: "Outcome changes when postal code is removed — injected for test.",
      sourceAgentId: "AG-BIAS-01",
      evidenceReferences: ["EV-05"],
    };

    const allAgreeWithFlag: AgentFinding[] = mockFindings.map((f, i) => ({
      ...f,
      recommendation: "Approve",
      risks: i === 2 ? [biasFlag] : [],
      claims: f.claims.map((c) => ({ ...c, status: "supported" as const })),
    }));

    const result = deliberate(allAgreeWithFlag);
    assert.equal(
      result.recommendation,
      "human_review",
      "Three-way agreement did not override the high-severity bias flag — if this fails, majority voting is masking bias",
    );
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Report generation — compartmentalization end-to-end
// ---------------------------------------------------------------------------
describe("Report generation — compartmentalization end-to-end", () => {
  /**
   * WHY THIS MATTERS:
   * The final audit report is the public record. Findings and juryResult must
   * remain clean of raw applicant PII. The full case evidence (including the
   * applicant section) may appear in the report's own evidence field — that
   * is intentional for the human-readable audit trail. But findings and
   * juryResult must not embed it.
   *
   * Additionally, each finding must carry its inputManifest through to the
   * report so that the audit trail can prove what each agent was given.
   */
  const juryResult = deliberate(mockFindings);
  const humanDecision = {
    action: "approved" as const,
    reason: "Human reviewer confirmed the financial evidence supports approval.",
    decidedBy: "Reviewer-001",
    decidedAt: "2026-09-18T09:43:00+03:00",
  };
  const report = generateReport(demoCase, mockFindings, juryResult, humanDecision);

  it("report juryResult risk flags must be traceable to agent findings", () => {
    const agentFlagIds = new Set(mockFindings.flatMap((f) => f.risks.map((r) => r.id)));
    for (const flag of report.juryResult.riskFlags) {
      assert.ok(
        agentFlagIds.has(flag.id),
        `Report juryResult contains flag "${flag.id}" not found in any agent finding`,
      );
    }
  });

  it("each finding in the report preserves its inputManifest", () => {
    /**
     * The inputManifest is the audit trail proving what each agent was given.
     * If it is stripped or overwritten in the report, the audit is untrustworthy.
     */
    for (const finding of report.findings) {
      assert.ok(
        finding.inputManifest,
        `Finding "${finding.agentId}" lost its inputManifest in the report`,
      );
    }
  });

  it("each finding in the report preserves its sealedInputDescription (UI display field)", () => {
    for (const finding of report.findings) {
      assert.ok(
        finding.sealedInputDescription && finding.sealedInputDescription.length > 0,
        `Finding "${finding.agentId}" lost its sealedInputDescription in the report`,
      );
    }
  });

  it("report findings must cover all three required roles", () => {
    const roles = new Set(report.findings.map((f) => f.role));
    assert.ok(roles.has("decision_witness"), "Report is missing decision_witness finding");
    assert.ok(roles.has("fact_checker"), "Report is missing fact_checker finding");
    assert.ok(roles.has("bias_privacy_challenger"), "Report is missing bias_privacy_challenger finding");
  });

  it("report findings all carry receivesOtherAgentFindings: false (blind testimony preserved in audit trail)", () => {
    /**
     * The audit report is generated after deliberation, but it must faithfully
     * represent that the testimony phase was blind. Every finding's manifest
     * should still show receivesOtherAgentFindings: false.
     */
    for (const finding of report.findings) {
      assert.equal(
        finding.inputManifest.receivesOtherAgentFindings,
        false,
        `Report finding "${finding.agentId}" has receivesOtherAgentFindings: true — blind testimony was not preserved`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Test 7 — Schema-level enforcement: Zod refine catches evidence violations
// ---------------------------------------------------------------------------
describe("Schema enforcement — Zod refine rejects out-of-manifest evidence references", () => {
  /**
   * WHY THIS MATTERS:
   * The AgentFindingSchema has a .refine() rule that enforces evidenceReferences
   * ⊆ inputManifest.allowedEvidenceIds at parse time. This test verifies that
   * the enforcement actually works — a real implementation that tries to
   * reference evidence it was not granted access to will be rejected by the
   * schema validator before the finding reaches the jury.
   */
  it("AgentFindingSchema.parse rejects a finding that references evidence outside its manifest", () => {
    const invalidFinding = {
      agentId: "AG-TEST-99",
      role: "fact_checker",
      displayName: "Rogue Fact Checker",
      recommendation: "Approve everything",
      confidence: 0.99,
      inputManifest: {
        purpose: "claim_verification",
        allowedEvidenceIds: ["EV-02"],   // Only EV-02 is allowed
        allowedDataCategories: ["credit"],
        allowedSensitiveFields: [],
        prohibitedContextTypes: ["other_agent_findings", "jury_conclusions"],
        receivesOtherAgentFindings: false,
        receivesInitialDecisionRationale: true,
      },
      sealedInputDescription: "Test — should be rejected",
      dataUsed: ["Credit bureau record"],
      evidenceReferences: ["EV-02", "EV-05"],  // EV-05 is NOT in allowedEvidenceIds
      claims: [],
      risks: [],
    };

    assert.throws(
      () => AgentFindingSchema.parse(invalidFinding),
      /evidenceReferences contains IDs not present in inputManifest\.allowedEvidenceIds/,
      "Zod refine did not reject a finding with out-of-manifest evidence references",
    );
  });

  it("AgentFindingSchema.parse accepts a finding whose evidenceReferences are all within the manifest", () => {
    const validFinding = {
      agentId: "AG-TEST-98",
      role: "fact_checker",
      displayName: "Compliant Fact Checker",
      recommendation: "Challenge declined",
      confidence: 0.85,
      inputManifest: {
        purpose: "claim_verification",
        allowedEvidenceIds: ["EV-02", "EV-03"],
        allowedDataCategories: ["credit", "banking"],
        allowedSensitiveFields: [],
        prohibitedContextTypes: ["other_agent_findings", "jury_conclusions"],
        receivesOtherAgentFindings: false,
        receivesInitialDecisionRationale: true,
      },
      sealedInputDescription: "Test — should be accepted",
      dataUsed: ["Credit bureau record", "Open banking summary"],
      evidenceReferences: ["EV-02", "EV-03"],  // Both are in allowedEvidenceIds
      claims: [],
      risks: [],
    };

    const result = AgentFindingSchema.parse(validFinding);
    assert.equal(result.agentId, "AG-TEST-98");
  });
});
