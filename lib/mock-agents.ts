import { AgentFindingSchema } from "./schemas";

// ---------------------------------------------------------------------------
// Mock agent findings
//
// Each finding carries an `inputManifest` — the structured, Zod-validated
// access contract that declares exactly what the agent was permitted to see.
// `sealedInputDescription` is derived from the manifest for UI display only;
// tests must use inputManifest fields, never the free-text string.
//
// Evidence catalogue for reference:
//   EV-01  Verified income statement       (income)
//   EV-02  Credit bureau record            (credit)
//   EV-03  Open banking summary            (banking)
//   EV-04  Bank migration notice           (context)
//   EV-05  Application profile             (applicant)  ← demographic / location data
// ---------------------------------------------------------------------------

export const mockFindings = AgentFindingSchema.array().parse([
  // -------------------------------------------------------------------------
  // Agent 1 — Decision Witness
  // Purpose: independent eligibility assessment from financial facts alone.
  // Must NOT receive: applicant profile (demographic), model-input labels,
  // other agents' findings, or jury conclusions.
  // -------------------------------------------------------------------------
  {
    agentId: "AG-DECISION-01",
    role: "decision_witness",
    displayName: "Decision Witness",
    recommendation: "Approve with standard affordability conditions",
    confidence: 0.78,
    inputManifest: {
      purpose: "eligibility_assessment",
      allowedEvidenceIds: ["EV-01", "EV-02", "EV-03"],
      allowedDataCategories: ["income", "credit", "banking"],
      // The witness requires no sensitive demographic fields — financial
      // figures alone are sufficient for an affordability assessment.
      allowedSensitiveFields: [],
      prohibitedContextTypes: [
        "other_agent_findings",
        "jury_conclusions",
        "raw_chain_of_thought",
        "full_applicant_record",
      ],
      receivesOtherAgentFindings: false,
      receivesInitialDecisionRationale: false,
    },
    // Human-readable summary derived from manifest above — UI display only.
    sealedInputDescription: "Financial eligibility fields only (income, credit, banking — no applicant profile or other agent findings)",
    dataUsed: ["Monthly income", "Debt-to-income", "Credit score", "Employment tenure", "Loan amount"],
    evidenceReferences: ["EV-01", "EV-02", "EV-03"],
    claims: [
      { id: "CL-01", statement: "Verified affordability is within standard policy limits.", status: "supported" },
      { id: "CL-02", statement: "Credit history shows no loan repayment defaults.", status: "supported" },
    ],
    risks: [],
  },

  // -------------------------------------------------------------------------
  // Agent 2 — Fact Checker
  // Purpose: verify whether the model's stated claims are supported by evidence.
  // Needs: the specific claims being checked + the evidence those claims cite.
  // Must NOT receive: applicant demographic profile, other agents' conclusions.
  // -------------------------------------------------------------------------
  {
    agentId: "AG-FACT-01",
    role: "fact_checker",
    displayName: "Fact Checker",
    recommendation: "Challenge the factual basis of the decline",
    confidence: 0.94,
    inputManifest: {
      purpose: "claim_verification",
      allowedEvidenceIds: ["EV-02", "EV-03", "EV-04"],
      allowedDataCategories: ["credit", "banking", "context"],
      // The Fact Checker only needs the claim text and the evidence that the
      // initial model cited. No demographic data is required to verify
      // whether a payment-instability claim is factually accurate.
      allowedSensitiveFields: [],
      prohibitedContextTypes: [
        "other_agent_findings",
        "jury_conclusions",
        "raw_chain_of_thought",
        "full_applicant_record",
      ],
      receivesOtherAgentFindings: false,
      receivesInitialDecisionRationale: true,
    },
    sealedInputDescription: "Initial decision claims + cited evidence only (credit, banking, context — no applicant profile or other agent findings)",
    dataUsed: ["Claim text", "Credit bureau record", "Open banking summary", "Bank migration notice"],
    evidenceReferences: ["EV-02", "EV-03", "EV-04"],
    claims: [
      { id: "CL-03", statement: "The model's 'payment instability' claim is not supported as stated.", status: "unsupported" },
      { id: "CL-04", statement: "Two utility transfers were delayed, then settled, during a documented bank migration.", status: "supported" },
      { id: "CL-05", statement: "The applicant has no missed credit instalments or defaults.", status: "supported" },
    ],
    risks: [
      {
        id: "RF-FACT-01",
        type: "factual",
        severity: "high",
        title: "Context collapsed into adverse signal",
        description: "Two operationally delayed utility transfers were generalised into recurring payment instability.",
        sourceAgentId: "AG-FACT-01",
        evidenceReferences: ["EV-02", "EV-03", "EV-04"],
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Agent 3 — Bias & Privacy Challenger
  // Purpose: test whether the outcome depends on protected attributes or
  // unnecessary data; run a counterfactual on the postal-risk index.
  //
  // Least-privilege fix applied here:
  //   BEFORE: evidenceReferences included EV-01, EV-02, EV-03, EV-05
  //   AFTER:  only EV-05 (applicant profile with postal code) is required.
  //
  // Rationale: the counterfactual test is "does removing postalCode change
  // the outcome?"  For that test, the challenger needs:
  //   • the model's input labels (to know which features were used) — not
  //     the underlying financial documents themselves;
  //   • EV-05 (the source that contains the location attribute being tested).
  // Passing EV-01/02/03 to this agent constitutes unnecessary data access —
  // the Bias Challenger cannot be more accurate about fairness by also reading
  // income statements and credit records.
  // -------------------------------------------------------------------------
  {
    agentId: "AG-BIAS-01",
    role: "bias_privacy_challenger",
    displayName: "Bias & Privacy Challenger",
    recommendation: "Require human review and exclude location proxy",
    confidence: 0.89,
    inputManifest: {
      purpose: "fairness_privacy_audit",
      allowedEvidenceIds: ["EV-05"],
      allowedDataCategories: ["applicant"],
      // postalCode is the protected attribute under test — the challenger
      // must have it in order to run the counterfactual.
      allowedSensitiveFields: ["postalCode"],
      prohibitedContextTypes: [
        "other_agent_findings",
        "jury_conclusions",
        "raw_chain_of_thought",
        // Full financial record is prohibited — the challenger works from
        // model input labels, not raw financial documents.
        "full_applicant_record",
      ],
      receivesOtherAgentFindings: false,
      // The challenger must see the initial decision rationale to identify
      // which inputs were used (including the postal-risk index).
      receivesInitialDecisionRationale: true,
    },
    sealedInputDescription: "Model input labels + applicant profile (EV-05 only) for counterfactual test — no financial documents, no other agent findings",
    dataUsed: ["Model input labels", "Postal code", "Counterfactual test result"],
    evidenceReferences: ["EV-05"],
    claims: [
      { id: "CL-06", statement: "Removing the postal-risk index changes the outcome from decline to approve.", status: "observed" },
      { id: "CL-07", statement: "Postal geography is not necessary to assess this applicant's affordability.", status: "supported" },
    ],
    risks: [
      {
        id: "RF-BIAS-01",
        type: "bias",
        severity: "high",
        title: "Outcome depends on location proxy",
        description: "The recommendation flips when postal geography is removed while legitimate financial facts remain unchanged.",
        sourceAgentId: "AG-BIAS-01",
        evidenceReferences: ["EV-05"],
      },
      {
        id: "RF-PRIV-01",
        type: "privacy",
        severity: "medium",
        title: "Questionable data necessity",
        description: "Granular location data influenced eligibility without a documented necessity for affordability assessment.",
        sourceAgentId: "AG-BIAS-01",
        evidenceReferences: ["EV-05"],
      },
    ],
  },
]);
