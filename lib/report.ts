import { CaseReportSchema, type AgentFinding, type Case, type HumanDecision, type JuryResult } from "./schemas";

export function generateReport(
  caseData: Case,
  findings: AgentFinding[],
  juryResult: JuryResult,
  humanDecision: HumanDecision,
) {
  return CaseReportSchema.parse({
    reportId: `RPT-${caseData.id}`,
    caseId: caseData.id,
    generatedAt: humanDecision.decidedAt,
    originalRecommendation: `${caseData.initialDecision.recommendation} (${Math.round(caseData.initialDecision.confidence * 100)}% confidence)`,
    summary: "Independent review found that the decline relied on an overstated payment-risk claim and a location-based proxy that materially changed the outcome.",
    findings,
    evidence: caseData.evidence,
    juryResult,
    humanDecision,
    auditTimeline: [
      { time: "09:42:00", title: "Case submitted", description: "Application and five evidence sources sealed into the case file." },
      { time: "09:42:04", title: "Initial decision recorded", description: "Northstar Lending Model v4.2 recommended decline at 86% confidence." },
      { time: "09:42:08", title: "Blind testimony opened", description: "Three agents received separate, minimum-necessary evidence packets." },
      { time: "09:42:15", title: "Material conflicts detected", description: "A factual overstatement and location-proxy dependency triggered review." },
      { time: "09:42:20", title: "Jury referred to human", description: "No majority vote was used; serious risk flags controlled escalation." },
      { time: humanDecision.decidedAt.split("T")[1]?.slice(0, 8) ?? "09:43:00", title: "Human judgment recorded", description: humanDecision.reason },
    ],
  });
}

