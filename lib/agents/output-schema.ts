import { z } from "zod";

export const AgentModelOutputSchema = z.object({
  recommendation: z.string().min(1).max(240),
  confidence: z.number().min(0).max(1),
  claims: z.array(z.object({
    statement: z.string().min(1).max(400),
    status: z.enum(["supported", "unsupported", "disputed", "observed"]),
  }).strict()).min(1).max(6),
  evidenceReferences: z.array(z.string()).max(5),
  risks: z.array(z.object({
    type: z.enum(["factual", "bias", "privacy", "evidence", "sovereignty"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    title: z.string().min(1).max(160),
    description: z.string().min(1).max(400),
    evidenceReferences: z.array(z.string()).max(5),
  }).strict()).max(5),
  dataUsed: z.array(z.string()).max(12),
}).strict();

export type AgentModelOutput = z.infer<typeof AgentModelOutputSchema>;

