import { z } from "zod";
import type { Case, CounterfactualResult } from "../schemas";
import { agentDefinitions, type AgentRole } from "./manifests";

const EvidenceSnippetSchema = z.object({
  id: z.string(),
  category: z.enum(["income", "credit", "banking", "applicant", "context"]),
  summary: z.string(),
  reliability: z.enum(["high", "medium", "low"]),
  dataPoints: z.array(z.string()),
}).strict();

const DecisionWitnessPacketSchema = z.object({
  role: z.literal("decision_witness"),
  evidence: z.array(EvidenceSnippetSchema).length(3),
}).strict();

const FactCheckerPacketSchema = z.object({
  role: z.literal("fact_checker"),
  claims: z.array(z.string()).min(1),
  evidence: z.array(EvidenceSnippetSchema).length(3),
}).strict();

const BiasPrivacyPacketSchema = z.object({
  role: z.literal("bias_privacy_challenger"),
  evidence: z.array(EvidenceSnippetSchema).length(1),
  postalCode: z.string().optional(),
  sensitivityInput: z.object({
    name: z.enum(["postalCode", "careerBreak", "districtCode"]),
    value: z.string(),
  }).strict(),
  modelInputLabels: z.array(z.string()),
  decisionMetadata: z.object({
    recommendation: z.enum(["approve", "decline", "manual_review"]),
    confidence: z.number().min(0).max(1),
  }).strict(),
  counterfactualResult: z.object({
    testedField: z.enum(["postalCode", "careerBreak", "districtCode"]),
    baselineRecommendation: z.enum(["approve", "decline", "manual_review"]),
    counterfactualRecommendation: z.enum(["approve", "decline", "manual_review"]),
    changedOutcome: z.boolean(),
    severity: z.enum(["low", "medium", "high"]),
    summary: z.string(),
  }).strict(),
}).strict();

export const AgentInputPacketSchema = z.discriminatedUnion("role", [
  DecisionWitnessPacketSchema,
  FactCheckerPacketSchema,
  BiasPrivacyPacketSchema,
]);

export type AgentInputPacket = z.infer<typeof AgentInputPacketSchema>;

function evidenceFor(caseData: Case, role: AgentRole) {
  const manifest = agentDefinitions[role].manifest;
  return manifest.allowedEvidenceIds.map((id) => {
    const evidence = caseData.evidence.find((source) => source.id === id);
    if (!evidence || !manifest.allowedDataCategories.includes(evidence.category)) {
      throw new Error(`Manifest evidence unavailable for ${role}`);
    }
    if (role === "bias_privacy_challenger") {
      return {
        id: evidence.id,
        category: evidence.category,
        summary: evidence.summary,
        reliability: evidence.reliability,
        dataPoints: [...evidence.dataPoints],
      };
    }
    return {
      id: evidence.id,
      category: evidence.category,
      summary: evidence.summary,
      reliability: evidence.reliability,
      dataPoints: [...evidence.dataPoints],
    };
  });
}

export function assertPacketWithinManifest(role: AgentRole, candidate: unknown): AgentInputPacket {
  const packet = AgentInputPacketSchema.parse(candidate);
  if (packet.role !== role) throw new Error("Agent role does not match input packet");
  const manifest = agentDefinitions[role].manifest;
  for (const evidence of packet.evidence) {
    if (!manifest.allowedEvidenceIds.includes(evidence.id) || !manifest.allowedDataCategories.includes(evidence.category)) {
      throw new Error(`Evidence ${evidence.id} is outside the ${role} manifest`);
    }
  }
  return packet;
}

export function createAgentInputPacket(role: AgentRole, caseData: Case, counterfactual?: CounterfactualResult): AgentInputPacket {
  if (role === "bias_privacy_challenger" && !counterfactual) {
    throw new Error("Bias Challenger requires a structured counterfactual result");
  }
  const evidence = evidenceFor(caseData, role);
  const candidate: AgentInputPacket = role === "decision_witness"
    ? { role, evidence }
    : role === "fact_checker"
      ? { role, claims: [...caseData.initialDecision.rationale], evidence }
      : {
          role,
          evidence,
          ...(counterfactual!.testedField === "postalCode" ? { postalCode: caseData.applicant.postalCode } : {}),
          sensitivityInput: {
            name: counterfactual!.testedField,
            value: counterfactual!.testedField === "postalCode" ? caseData.applicant.postalCode : "Present in EV-05 model metadata",
          },
          modelInputLabels: [...caseData.initialDecision.dataUsed],
          decisionMetadata: {
            recommendation: caseData.initialDecision.recommendation,
            confidence: caseData.initialDecision.confidence,
          },
          counterfactualResult: counterfactual!,
        };
  return structuredClone(assertPacketWithinManifest(role, candidate));
}
