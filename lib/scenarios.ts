import { z } from "zod";
import { CaseSchema, type Case } from "./schemas";

export const ScenarioIdSchema = z.enum(["lending", "hr_screening", "benefits"]);
export type ScenarioId = z.infer<typeof ScenarioIdSchema>;

export type ScenarioDefinition = {
  id: ScenarioId;
  shortLabel: string;
  title: string;
  description: string;
  subject: string;
  initialDecisionLabel: string;
  confidence: number;
  reason: string;
  inputs: Array<{ label: string; value: string }>;
  evidenceLabels: string[];
  witnessFindings: [string, string, string];
  judgeIssues: [string, string];
  dataNotUsed: string[];
  sensitivity: { field: "postalCode" | "careerBreak" | "districtCode"; label: string; originalValue: string; removedValue: string };
  caseData: Case;
};

function makeCase(input: {
  id: string;
  title: string;
  name: string;
  occupation: string;
  purpose: string;
  confidence: number;
  reason: string;
  dataUsed: string[];
  evidence: Array<[string, string, "income" | "credit" | "banking" | "context" | "applicant", string, string[]]>;
}): Case {
  return CaseSchema.parse({
    id: input.id,
    title: input.title,
    status: "intake",
    submittedAt: "2026-09-19T12:00:00+03:00",
    applicant: {
      id: `SUB-${input.id}`,
      name: input.name,
      age: 34,
      occupation: input.occupation,
      employmentYears: 6.8,
      monthlyIncomeEur: 5250,
      requestedAmountEur: 18500,
      loanPurpose: input.purpose,
      creditScore: 718,
      debtToIncomeRatio: 0.31,
      postalCode: "00990",
    },
    evidence: input.evidence.map(([id, title, category, summary, dataPoints]) => ({
      id,
      title,
      provider: "Verified enterprise source",
      category,
      verified: true,
      collectedAt: "19 Sep 2026 · 11:58",
      summary,
      reliability: category === "applicant" ? "medium" : "high",
      dataPoints,
    })),
    initialDecision: {
      recommendation: "decline",
      confidence: input.confidence / 100,
      model: "Enterprise Decision Model",
      rationale: [input.reason, "The automated threshold was exceeded."],
      dataUsed: input.dataUsed,
    },
  });
}

export const scenarios: ScenarioDefinition[] = [
  {
    id: "lending",
    shortLabel: "Lending",
    title: "Loan approval governance",
    description: "Review an automated consumer lending decision.",
    subject: "€18,500 renovation loan · Emma Lindholm",
    initialDecisionLabel: "Decline",
    confidence: 86,
    reason: "Payment instability + location risk",
    inputs: [{ label: "Income", value: "€5,250 / month" }, { label: "Credit", value: "718 · no defaults" }, { label: "DTI", value: "31%" }],
    evidenceLabels: ["Income & employment", "Credit history", "Payment history", "Bank migration", "Application profile"],
    witnessFindings: ["Financial evidence supports affordability.", "Payment-instability claim is unsupported.", "Postal-code sensitivity was detected."],
    judgeIssues: ["Unsupported payment-risk claim", "Postal-code sensitivity"],
    dataNotUsed: ["Name", "Age", "Full address"],
    sensitivity: { field: "postalCode", label: "Postal geography", originalValue: "02150", removedValue: "Removed" },
    caseData: makeCase({
      id: "JAI-LEND-0417", title: "Consumer loan eligibility review", name: "Emma Lindholm", occupation: "Operations Manager", purpose: "Home energy renovation", confidence: 86,
      reason: "Recent payment instability and location risk indicate elevated repayment risk.", dataUsed: ["Income", "Credit score", "Payment history", "Postal code"],
      evidence: [
        ["EV-01", "Verified income statement", "income", "Stable monthly income of €5,250 across 24 months.", ["Monthly income", "Employment tenure"]],
        ["EV-02", "Credit bureau record", "credit", "Score 718 with no defaults, collections, or missed instalments.", ["Credit score", "Payment history"]],
        ["EV-03", "Open banking summary", "banking", "31% debt-to-income ratio; two transfers posted 48 hours late.", ["Debt-to-income", "Transfer timestamps"]],
        ["EV-04", "Bank migration notice", "context", "The late transfers occurred during a documented account migration.", ["Migration window", "Settlement status"]],
        ["EV-05", "Application profile", "applicant", "The decision model received a postal-geography field.", ["Postal code", "Requested amount"]],
      ],
    }),
  },
  {
    id: "hr_screening",
    shortLabel: "HR screening",
    title: "Candidate ranking review",
    description: "Challenge an automated candidate-screening outcome.",
    subject: "Operations Lead candidate · Alex Morgan",
    initialDecisionLabel: "Do not progress",
    confidence: 82,
    reason: "Employment gap + location proxy",
    inputs: [{ label: "Experience", value: "7 years" }, { label: "Skills match", value: "91%" }, { label: "Interview", value: "Strong" }],
    evidenceLabels: ["Employment history", "Skills assessment", "Interview scorecard", "Career-break context", "Candidate profile"],
    witnessFindings: ["Role evidence supports progression.", "Employment-gap risk is contradicted by context.", "Location-proxy sensitivity was detected."],
    judgeIssues: ["Unsupported employment-gap inference", "Location-proxy sensitivity"],
    dataNotUsed: ["Name", "Age", "Profile photo"],
    sensitivity: { field: "careerBreak", label: "Career-break indicator", originalValue: "Included", removedValue: "Neutralized" },
    caseData: makeCase({
      id: "JAI-HR-0284", title: "Candidate ranking review", name: "Alex Morgan", occupation: "Operations Lead candidate", purpose: "Operations Lead role", confidence: 82,
      reason: "A career-break indicator reduced the candidate ranking.", dataUsed: ["Employment history", "Skills score", "Interview score", "Career-break indicator"],
      evidence: [
        ["EV-01", "Verified employment history", "income", "Seven years of relevant operations experience with consistent progression.", ["Experience length", "Role progression"]],
        ["EV-02", "Skills assessment", "credit", "The candidate achieved a 91% match on role-critical skills.", ["Skills match", "Assessment score"]],
        ["EV-03", "Interview scorecard", "banking", "Structured interview ratings were strong across all required competencies.", ["Competency ratings", "Panel score"]],
        ["EV-04", "Career-break context", "context", "The employment gap was a documented caregiving leave, not performance-related.", ["Leave chronology", "Return-to-work date"]],
        ["EV-05", "Candidate profile", "applicant", "The ranking model received a career-break indicator.", ["Career-break indicator", "Role applied for"]],
      ],
    }),
  },
  {
    id: "benefits",
    shortLabel: "Public benefits",
    title: "Eligibility decision review",
    description: "Review a public-sector benefits eligibility decision.",
    subject: "Housing benefit application · Case B-1092",
    initialDecisionLabel: "Deny eligibility",
    confidence: 84,
    reason: "Income mismatch + district risk",
    inputs: [{ label: "Household", value: "2 people" }, { label: "Income", value: "Verified" }, { label: "Residency", value: "Eligible" }],
    evidenceLabels: ["Income verification", "Eligibility record", "Payment ledger", "Benefit-cycle notice", "Applicant profile"],
    witnessFindings: ["Verified records support eligibility.", "Income-mismatch claim is explained by timing.", "District sensitivity was detected."],
    judgeIssues: ["Unsupported income-mismatch claim", "District proxy sensitivity"],
    dataNotUsed: ["Name", "Age", "Ethnicity"],
    sensitivity: { field: "districtCode", label: "District risk score", originalValue: "Included", removedValue: "Neutralized" },
    caseData: makeCase({
      id: "JAI-GOV-1092", title: "Housing benefit eligibility review", name: "Case B-1092", occupation: "Benefits applicant", purpose: "Housing benefit", confidence: 84,
      reason: "A reported income mismatch and district risk exceeded the eligibility threshold.", dataUsed: ["Verified income", "Eligibility record", "Payment timing", "Postal code"],
      evidence: [
        ["EV-01", "Income verification", "income", "Declared household income matches the verified employer and tax records.", ["Household income", "Tax record"]],
        ["EV-02", "Eligibility record", "credit", "Residency and household composition satisfy the published eligibility rules.", ["Residency status", "Household size"]],
        ["EV-03", "Payment ledger", "banking", "One benefit-cycle payment appears in the following reporting period.", ["Payment date", "Reporting period"]],
        ["EV-04", "Benefit-cycle notice", "context", "The agency notice confirms the payment crossed reporting periods because of processing timing.", ["Processing date", "Cycle boundary"]],
        ["EV-05", "Applicant profile", "applicant", "The eligibility model received a district-level postal field.", ["Postal code", "Benefit type"]],
      ],
    }),
  },
];

export function getScenario(id: unknown): ScenarioDefinition {
  const parsed = ScenarioIdSchema.safeParse(id);
  return scenarios.find((scenario) => scenario.id === (parsed.success ? parsed.data : "lending")) ?? scenarios[0];
}

export function getScenarioForCase(caseData: Case): ScenarioDefinition {
  return scenarios.find((scenario) => scenario.caseData.id === caseData.id) ?? scenarios[0];
}
