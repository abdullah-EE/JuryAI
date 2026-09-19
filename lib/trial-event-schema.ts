import { z } from "zod";
import { DemoRunResultSchema } from "./compliance";

export const TrialEventTypeSchema = z.enum([
  "trial_started", "identity_firewall_completed", "evidence_partitioned", "sufficiency_gate_checked", "evidence_analysis_started", "evidence_analysis_completed",
  "witness_started", "witness_completed", "finding_sealed", "counterfactual_completed",
  "clerk_started", "case_packet_created", "juror_started", "juror_vote_sealed", "jury_complete",
  "jury_revealed", "safeguard_triggered", "judge_assessment_ready", "human_review_required",
  "audit_ready", "trial_completed",
]);
const DetailValueSchema = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);
export const TrialEventSchema = z.object({
  type: TrialEventTypeSchema, sequence: z.number().int().positive(), timestamp: z.string(), role: z.string().optional(),
  evidenceIds: z.array(z.string()).optional(), status: z.string().optional(), summary: z.string().max(300).optional(),
  risk: z.string().max(180).optional(), confidence: z.number().min(0).max(1).optional(), mode: z.enum(["live", "fallback"]).optional(),
  details: z.record(z.string(), DetailValueSchema).optional(), result: DemoRunResultSchema.optional(),
}).strict();
export type TrialEvent = z.infer<typeof TrialEventSchema>;
