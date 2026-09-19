import { JuryVerdictSchema, type CasePacket, type JurorVote } from "../schemas";

export function safeguardTriggers(packet: CasePacket): string[] {
  const triggers: string[] = [];
  if (packet.counterfactual.changedOutcome) triggers.push("Counterfactual sensitivity");
  if (packet.riskFlags.some((risk) => risk.type === "factual" && ["high", "critical"].includes(risk.severity))) triggers.push("Serious factual risk");
  if (packet.riskFlags.some((risk) => ["bias", "privacy"].includes(risk.type) && ["high", "critical"].includes(risk.severity))) triggers.push("Serious fairness or privacy risk");
  if (packet.riskFlags.some((risk) => risk.type === "evidence" && ["high", "critical"].includes(risk.severity)) || packet.disputedFindings.length > 0) triggers.push("Unsupported material evidence");
  if (packet.riskFlags.some((risk) => risk.type === "procedural" && ["high", "critical"].includes(risk.severity))) triggers.push("Serious procedural violation");
  return Array.from(new Set(triggers));
}

export function calculateJuryVerdict(votes: JurorVote[], packet: CasePacket) {
  const counts = { uphold: 0, overturn: 0, human_review: 0 };
  for (const vote of votes) counts[vote.vote] += 1;
  const majorityEntry = Object.entries(counts).find(([, count]) => count >= 2);
  const majority = (majorityEntry?.[0] ?? "human_review") as JurorVote["vote"];
  const winning = counts[majority];
  const triggers = safeguardTriggers(packet);
  const split = majorityEntry
    ? `${winning}–${votes.length - winning} ${majority}`
    : `${counts.uphold}–${counts.overturn}–${counts.human_review} human_review`;
  return JuryVerdictSchema.parse({
    majority,
    split,
    votes,
    disagreement: new Set(votes.map((vote) => vote.vote)).size > 1,
    judicialReviewRequired: triggers.length > 0,
    safeguardTriggers: triggers,
  });
}
