import type { DemoRunResult } from "./compliance";
import type { ScenarioDefinition } from "./scenarios";
import type { TrialEvent } from "./trial-event-schema";

export type ExplanationIntent = "decision_reason" | "evidence_support" | "counterfactual" | "privacy" | "context_access" | "jury_disagreement" | "human_review" | "missing_evidence" | "unknown";
export type ExplainabilityAnswer = {
  intent: ExplanationIntent;
  heading: string;
  paragraphs: string[];
  sources: string[];
  highlights: string[];
  counterfactual?: { original: string; originalResult: string; changed: string; changedResult: string };
};

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function classifyExplanationQuestion(question: string): ExplanationIntent {
  const value = question.toLowerCase();
  if (/identif|identity|firewall|removed|redact|personal information/.test(value)) return "privacy";
  if (/what .*see|information .*see|hidden|context contract|allowed|blocked/.test(value)) return "context_access";
  if (/counterfactual|geograph|postal|without.*chang|had not changed/.test(value)) return "counterfactual";
  if (/juror|vote|disagree|split/.test(value)) return "jury_disagreement";
  if (/human review|escalat|safeguard/.test(value)) return "human_review";
  if (/what evidence would|change this conclusion|missing evidence|more evidence/.test(value)) return "missing_evidence";
  if (/payment|unsupported|evidence mattered|which evidence|support/.test(value)) return "evidence_support";
  if (/why.*overturn|recommend.*overturn|original decision|why.*challeng/.test(value)) return "decision_reason";
  return "unknown";
}

export function answerFromTrialRecord(question: string, scenario: ScenarioDefinition, run: DemoRunResult, events: TrialEvent[]): ExplainabilityAnswer {
  const intent = classifyExplanationQuestion(question);
  const findings = run.review.findings;
  const fact = findings.find((item) => item.role === "fact_checker")!;
  const decision = findings.find((item) => item.role === "decision_witness")!;
  const bias = findings.find((item) => item.role === "bias_privacy_challenger")!;
  const evidenceLabel = (id: string) => scenario.caseData.evidence.find((item) => item.id === id)?.title ?? id;
  const firewall = events.find((event) => event.type === "identity_firewall_completed");

  if (intent === "decision_reason") {
    const sources = unique([...fact.evidenceReferences, ...bias.evidenceReferences]);
    return { intent, heading: "Why the original decision was challenged", paragraphs:[`The original AI returned ${scenario.initialDecisionLabel.toLowerCase()} at ${scenario.confidence}% confidence, citing ${scenario.reason.toLowerCase()}.`,`${fact.displayName} found the factual rationale unsupported, while the sensitivity test changed the outcome when ${scenario.sensitivity.label.toLowerCase()} was neutralized. The jury therefore reached ${run.review.court.juryVerdict.split}.`],sources,highlights:[fact.displayName,bias.displayName,"Jury verdict"] };
  }
  if (intent === "evidence_support") {
    const contextual = scenario.caseData.evidence.find((item) => item.id === "EV-04");
    const claim = fact.claims.find((item) => item.status === "unsupported" || item.status === "disputed");
    return { intent, heading:"Why the factual claim was unsupported", paragraphs:[`The original rationale relied on ${scenario.reason.toLowerCase()}.`,`${contextual?.id ?? "Context evidence"} records: ${contextual?.summary ?? claim?.statement ?? fact.recommendation} That verified context conflicted with the original inference, so the Fact Checker marked the claim as unsupported.`],sources:fact.evidenceReferences,highlights:[fact.displayName,...fact.evidenceReferences.map(evidenceLabel)] };
  }
  if (intent === "context_access") {
    const asksBias=/bias|privacy|hidden/i.test(question);const finding=asksBias?bias:decision;const allowed=finding.inputManifest.allowedEvidenceIds;const hidden=scenario.caseData.evidence.filter((item)=>!allowed.includes(item.id)).map((item)=>item.id);
    return { intent, heading:`${finding.displayName} context contract`, paragraphs:[`${finding.displayName} received only ${allowed.map((id)=>`${id} (${evidenceLabel(id)})`).join(", ")}.`,`${hidden.join(", ")} and all other agents' findings were hidden. The session was stateless and produced only a structured sealed finding.`],sources:allowed,highlights:["Context Contract",...allowed.map(evidenceLabel),"Other testimony hidden"] };
  }
  if (intent === "counterfactual") {
    const noChange=/not changed|had not changed|without.*change/i.test(question);
    return { intent, heading:noChange?"If the outcome had stayed the same":"Why the counterfactual mattered", paragraphs:noChange?[`If neutralizing ${scenario.sensitivity.label.toLowerCase()} had not changed the recommendation, this test would not have created a counterfactual-sensitivity safeguard.`,`Other factual or privacy risks could still independently require human review; the current record does not establish what the final jury vote would have been.`]:[run.review.counterfactual.summary,"The changed outcome identifies material sensitivity and requires human review. It does not, by itself, prove discrimination."],sources:bias.evidenceReferences,highlights:["Counterfactual test",...bias.evidenceReferences],counterfactual:{original:`${scenario.sensitivity.label}: ${scenario.sensitivity.originalValue}`,originalResult:run.review.counterfactual.baselineRecommendation,changed:`${scenario.sensitivity.label}: ${scenario.sensitivity.removedValue}`,changedResult:run.review.counterfactual.counterfactualRecommendation} };
  }
  if (intent === "privacy") {
    const removed=(firewall?.details?.redactedFields as string[]|undefined)??scenario.dataNotUsed;const retained=(firewall?.details?.retainedFields as string[]|undefined)??scenario.caseData.initialDecision.dataUsed;
    return { intent, heading:"What the Identity Firewall removed", paragraphs:[`Before agent review, the firewall pseudonymized or removed: ${removed.join(", ")}.`,`Only purpose-limited fields remained: ${retained.join(", ")}. Identifying details were not included in the agents' structured packets.`],sources:[],highlights:["Identity Firewall","Direct identifiers removed","Safe case created"] };
  }
  if (intent === "jury_disagreement") {
    const majority=run.review.court.juryVerdict.majority;const dissent=run.review.court.jurorVotes.filter((vote)=>vote.vote!==majority);
    return { intent, heading:"Where the jury differed", paragraphs:[`${run.review.court.juryVerdict.split}. ${dissent.map((vote)=>`${vote.jurorId} voted ${vote.vote.replace("_"," ")}: ${vote.reason}`).join(" ")||"No juror differed from the majority."}`,"Votes were produced in independent sessions and revealed only after all three were sealed."],sources:unique(dissent.flatMap((vote)=>vote.keyEvidenceIds)),highlights:dissent.map((vote)=>`${vote.jurorId} · ${vote.view.replaceAll("_"," ")}`) };
  }
  if (intent === "human_review") {
    const triggers=run.review.court.juryVerdict.safeguardTriggers;
    return { intent, heading:"Why human review was required", paragraphs:[`The safeguard record contains ${triggers.length} trigger${triggers.length===1?"":"s"}: ${triggers.join("; ")}.`,"These material factual and sensitivity risks prevent automatic acceptance of the jury majority. A named human must make and record the final decision."],sources:unique([...fact.evidenceReferences,...bias.evidenceReferences]),highlights:["Procedural safeguard",...triggers] };
  }
  if (intent === "missing_evidence") {
    const disputed=run.review.court.casePacket.disputedFindings.map((item)=>item.evidenceId);
    return { intent, heading:"What could change the conclusion", paragraphs:[`New verified evidence would need to resolve the disputed findings (${disputed.join(", ")||"none identified"}) or show that the detected sensitivity does not affect the decision.`,"The current record does not contain that evidence, so JuryAI cannot predict a different outcome."],sources:unique(disputed),highlights:["Disputed findings","Additional verified evidence required"] };
  }
  return { intent, heading:"Not enough evidence in this record", paragraphs:["The current case record does not contain enough evidence to answer that."],sources:[],highlights:["No unsupported inference"] };
}
