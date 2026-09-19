import {
  CasePacketSchema,
  EvidenceLedgerSchema,
  type AgentFinding,
  type CasePacket,
  type CounterfactualResult,
  type EvidenceLedger,
  type EvidenceMicroFinding,
} from "../schemas";

export function createEvidenceLedger(findings: EvidenceMicroFinding[]): EvidenceLedger {
  const entries: EvidenceMicroFinding[] = [];
  const seen = new Set<string>();
  for (const raw of findings) {
    const finding = structuredClone(raw);
    const key = `${finding.evidenceId}|${finding.sourceRole}|${finding.finding}|${finding.supportStatus}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(finding);
  }
  return EvidenceLedgerSchema.parse({ entries, provenancePreserved: true, deduplicatedCount: findings.length - entries.length });
}

export function buildCasePacket(
  ledger: EvidenceLedger,
  witnesses: AgentFinding[],
  counterfactual: CounterfactualResult,
  packetId = "CP-JAI-2026-0417",
): CasePacket {
  const verifiedFindings = ledger.entries.filter((entry) => entry.supportStatus === "verified");
  const disputedFindings = ledger.entries.filter((entry) => entry.supportStatus !== "verified");
  const riskFlags = witnesses.flatMap((finding) => finding.risks).map((risk) => ({
    type: risk.type === "sovereignty" ? "procedural" as const : risk.type,
    severity: risk.severity,
    evidenceIds: [...risk.evidenceReferences],
    label: risk.title,
  }));
  for (const entry of ledger.entries) {
    if (!entry.riskType || entry.severity === "none") continue;
    riskFlags.push({
      type: entry.riskType,
      severity: entry.severity,
      evidenceIds: [entry.evidenceId],
      label: entry.finding.slice(0, 160),
    });
  }
  if (counterfactual.changedOutcome) riskFlags.push({
    type: "bias",
    severity: counterfactual.severity,
    evidenceIds: ["EV-05"],
    label: `${counterfactual.testedField} counterfactual changed the recommendation`,
  });
  const unsupported = witnesses.flatMap((finding) => finding.claims.filter((claim) => claim.status === "unsupported"));
  for (const claim of unsupported) riskFlags.push({
    type: "factual",
    severity: "high",
    evidenceIds: witnesses.find((finding) => finding.claims.includes(claim))?.evidenceReferences ?? [],
    label: `Unsupported material claim: ${claim.statement}`.slice(0, 160),
  });
  const contradictions = unsupported.map((claim) => `Witness testimony disputes: ${claim.statement}`.slice(0, 200));
  const confidence = ledger.entries.length
    ? Number((ledger.entries.reduce((sum, entry) => sum + entry.confidence, 0) / ledger.entries.length).toFixed(2))
    : 0;
  return CasePacketSchema.parse({
    packetId,
    verifiedFindings,
    disputedFindings,
    evidenceReferences: Array.from(new Set(ledger.entries.map((entry) => entry.evidenceId))),
    counterfactual: {
      testedField: counterfactual.testedField,
      changedOutcome: counterfactual.changedOutcome,
      baselineRecommendation: counterfactual.baselineRecommendation,
      counterfactualRecommendation: counterfactual.counterfactualRecommendation,
      severity: counterfactual.severity,
    },
    riskFlags: riskFlags.filter((risk, index, all) => index === all.findIndex((candidate) =>
      candidate.type === risk.type
      && candidate.severity === risk.severity
      && candidate.label === risk.label
      && candidate.evidenceIds.join("|") === risk.evidenceIds.join("|"),
    )),
    contradictions,
    confidence,
  });
}
