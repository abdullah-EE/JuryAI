import { z } from "zod";
import { AgentReviewResultSchema, type AgentReviewResult } from "./schemas";
import type { ScenarioDefinition } from "./scenarios";

export const ProcessingZoneIdSchema = z.enum(["local_demo", "eu_trusted", "us_trusted", "private_enterprise"]);
export type ProcessingZoneId = z.infer<typeof ProcessingZoneIdSchema>;

export const processingZones = [
  { id: "local_demo" as const, label: "Local / Demo", location: "Local demo process", note: "Designed for deterministic demonstration and local fallback." },
  { id: "eu_trusted" as const, label: "EU Trusted Zone", location: "EU policy boundary", note: "EU processing policy selected; infrastructure routing is simulated in this prototype." },
  { id: "us_trusted" as const, label: "US Trusted Zone", location: "US policy boundary", note: "US processing policy selected; infrastructure routing is simulated in this prototype." },
  { id: "private_enterprise" as const, label: "Private Enterprise Zone", location: "Mock private environment", note: "Private-enterprise boundary selected; dedicated infrastructure is not provisioned in this prototype." },
];

export const ComplianceSummarySchema = z.object({
  data_used: z.array(z.string()),
  data_not_used: z.array(z.string()),
  sensitive_fields_seen: z.array(z.string()),
  sensitive_fields_blocked: z.array(z.string()),
  human_review_required: z.boolean(),
  evidence_traceability: z.array(z.string()),
  retention_mode: z.string(),
  storage_mode: z.string(),
  processing_zone: z.string(),
  raw_data_leaves_environment: z.boolean(),
  derived_summaries_only: z.boolean(),
  sovereignty_note: z.string(),
  fairness_checks_run: z.array(z.string()),
  residual_risks: z.array(z.string()),
  governance_explanation: z.string(),
}).strict();

export type ComplianceSummary = z.infer<typeof ComplianceSummarySchema>;

export function generateComplianceSummary(scenario: ScenarioDefinition, zoneId: ProcessingZoneId, review: AgentReviewResult): ComplianceSummary {
  const zone = processingZones.find((item) => item.id === zoneId) ?? processingZones[0];
  return ComplianceSummarySchema.parse({
    data_used: scenario.caseData.initialDecision.dataUsed,
    data_not_used: scenario.dataNotUsed,
    sensitive_fields_seen: ["Postal geography — Bias & Privacy Challenger only"],
    sensitive_fields_blocked: scenario.dataNotUsed,
    human_review_required: review.court.juryVerdict.judicialReviewRequired,
    evidence_traceability: review.court.casePacket.evidenceReferences,
    retention_mode: "Stateless isolated sessions",
    storage_mode: "Provider response storage disabled",
    processing_zone: zone.label,
    raw_data_leaves_environment: review.mode === "live",
    derived_summaries_only: true,
    sovereignty_note: `${zone.note} Only scoped evidence summaries are sent to live sessions.`,
    fairness_checks_run: ["Postal-geography counterfactual", "Proxy-risk review", "Sensitive-field minimization"],
    residual_risks: review.court.juryVerdict.safeguardTriggers,
    governance_explanation: "Minimum-necessary packets, traceable evidence, stateless processing, independent review, and mandatory human authority provide an auditable governance layer.",
  });
}

export const DemoRunResultSchema = z.object({
  scenarioId: z.enum(["lending", "hr_screening", "benefits"]),
  zoneId: ProcessingZoneIdSchema,
  review: AgentReviewResultSchema,
  compliance: ComplianceSummarySchema,
}).strict();

export type DemoRunResult = z.infer<typeof DemoRunResultSchema>;
