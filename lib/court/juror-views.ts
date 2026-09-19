import type { CasePacket, EvidenceMicroFinding } from "../schemas";

export type JurorViewId = "evidence_first" | "claim_evidence" | "contradiction_first";

type ViewAudit = {
  packetId: string;
  materialSignature: string;
  evidenceIds: string[];
  findingCount: number;
  riskCount: number;
};

export type JurorView =
  | { view: "evidence_first"; audit: ViewAudit; evidence: { verified: EvidenceMicroFinding[]; disputed: EvidenceMicroFinding[] }; risks: CasePacket["riskFlags"]; counterfactual: CasePacket["counterfactual"]; contradictions: string[]; confidence: number }
  | { view: "claim_evidence"; audit: ViewAudit; claims: Array<{ claim: string; evidenceId: string; status: EvidenceMicroFinding["supportStatus"]; confidence: number; associatedRisks: CasePacket["riskFlags"] }>; contradictions: string[]; counterfactual: CasePacket["counterfactual"]; unassociatedRisks: CasePacket["riskFlags"]; confidence: number }
  | { view: "contradiction_first"; audit: ViewAudit; contradictions: string[]; disputedEvidence: EvidenceMicroFinding[]; supportingEvidence: EvidenceMicroFinding[]; counterfactual: CasePacket["counterfactual"]; remainingRisks: CasePacket["riskFlags"]; confidence: number };

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function casePacketMaterialSignature(packet: CasePacket): string {
  return stable({
    verifiedFindings: packet.verifiedFindings,
    disputedFindings: packet.disputedFindings,
    evidenceReferences: packet.evidenceReferences,
    counterfactual: packet.counterfactual,
    riskFlags: packet.riskFlags,
    contradictions: packet.contradictions,
    confidence: packet.confidence,
  });
}

function audit(packet: CasePacket): ViewAudit {
  return {
    packetId: packet.packetId,
    materialSignature: casePacketMaterialSignature(packet),
    evidenceIds: [...packet.evidenceReferences],
    findingCount: packet.verifiedFindings.length + packet.disputedFindings.length,
    riskCount: packet.riskFlags.length,
  };
}

export function buildJurorView(jurorId: "J1" | "J2" | "J3", packet: CasePacket): JurorView {
  const sharedAudit = audit(packet);
  if (jurorId === "J1") return structuredClone({
    view: "evidence_first" as const,
    audit: sharedAudit,
    evidence: { verified: packet.verifiedFindings, disputed: packet.disputedFindings },
    risks: packet.riskFlags,
    counterfactual: packet.counterfactual,
    contradictions: packet.contradictions,
    confidence: packet.confidence,
  });
  if (jurorId === "J2") {
    const findings = [...packet.verifiedFindings, ...packet.disputedFindings];
    const associated = new Set(findings.flatMap((finding) => packet.riskFlags.filter((risk) => risk.evidenceIds.includes(finding.evidenceId))));
    return structuredClone({
      view: "claim_evidence" as const,
      audit: sharedAudit,
      claims: findings.map((finding) => ({
        claim: finding.finding,
        evidenceId: finding.evidenceId,
        status: finding.supportStatus,
        confidence: finding.confidence,
        associatedRisks: packet.riskFlags.filter((risk) => risk.evidenceIds.includes(finding.evidenceId)),
      })),
      contradictions: packet.contradictions,
      counterfactual: packet.counterfactual,
      unassociatedRisks: packet.riskFlags.filter((risk) => !associated.has(risk)),
      confidence: packet.confidence,
    });
  }
  return structuredClone({
    view: "contradiction_first" as const,
    audit: sharedAudit,
    contradictions: packet.contradictions,
    disputedEvidence: packet.disputedFindings,
    supportingEvidence: packet.verifiedFindings,
    counterfactual: packet.counterfactual,
    remainingRisks: packet.riskFlags,
    confidence: packet.confidence,
  });
}

export function buildAllJurorViews(packet: CasePacket) {
  return {
    J1: buildJurorView("J1", packet),
    J2: buildJurorView("J2", packet),
    J3: buildJurorView("J3", packet),
  } as const;
}

