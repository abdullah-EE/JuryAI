import { z } from "zod";
import { CaseSchema, type Case } from "./schemas";

export const IdentityFirewallAuditSchema = z.object({
  caseId: z.string(),
  subjectToken: z.string(),
  redactedFields: z.array(z.string()),
  retainedFields: z.array(z.string()),
  directIdentifiersRemoved: z.literal(true),
}).strict();

export type IdentityFirewallAudit = z.infer<typeof IdentityFirewallAuditSchema>;

export function applyIdentityFirewall(rawCase: Case): { safeCase: Case; audit: IdentityFirewallAudit } {
  const subjectToken = `SUBJECT-${rawCase.id.split("-").at(-1) ?? "CASE"}`;
  const directValues = [rawCase.applicant.name, rawCase.applicant.id].filter(Boolean);
  const redact = (value: string) => directValues.reduce((text, identifier) => text.replaceAll(identifier, "[REDACTED]"), value);
  const safeCase = CaseSchema.parse({
    ...structuredClone(rawCase),
    applicant: {
      ...structuredClone(rawCase.applicant),
      id: subjectToken,
      name: "[REDACTED]",
    },
    evidence: rawCase.evidence.map((item) => ({
      ...structuredClone(item),
      title: redact(item.title),
      provider: redact(item.provider),
      summary: redact(item.summary),
      dataPoints: item.dataPoints.map(redact),
    })),
    initialDecision: {
      ...structuredClone(rawCase.initialDecision),
      rationale: rawCase.initialDecision.rationale.map(redact),
    },
  });
  const audit = IdentityFirewallAuditSchema.parse({
    caseId: rawCase.id,
    subjectToken,
    redactedFields: ["applicant.name", "applicant.id", "embedded direct identifiers"],
    retainedFields: ["verified evidence", "decision metadata", "purpose-limited sensitivity field"],
    directIdentifiersRemoved: true,
  });
  return { safeCase, audit };
}
