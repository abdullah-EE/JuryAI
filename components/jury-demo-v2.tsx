"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { answerFromTrialRecord, type ExplainabilityAnswer } from "@/lib/explainability";
import { scenarios } from "@/lib/scenarios";
import { HumanDecisionSchema, type AgentFinding, type HumanDecision } from "@/lib/schemas";
import { TrialEventSchema, type TrialEvent } from "@/lib/trial-event-schema";
import type { DemoRunResult } from "@/lib/compliance";

type Screen = "decision" | "trial" | "review";
type Role = AgentFinding["role"];

const scenario = scenarios.find((item) => item.id === "lending") ?? scenarios[0];
const specialists: Array<{ role: Role; short: string; name: string; allowed: string[]; blocked: string }> = [
  { role: "decision_witness", short: "DW", name: "Decision Witness", allowed: ["EV-01", "EV-02", "EV-03"], blocked: "Identity · geography · other findings" },
  { role: "fact_checker", short: "FC", name: "Fact Checker", allowed: ["EV-02", "EV-03", "EV-04"], blocked: "Model identity · jury view · other findings" },
  { role: "bias_privacy_challenger", short: "BP", name: "Bias + Privacy", allowed: ["EV-05"], blocked: "Financial records · identity · other findings" },
];
const prompts = [
  "Why overturn?",
  "What evidence mattered?",
  "What data was hidden?",
  "Why human review?",
];
const has = (events: TrialEvent[], type: TrialEvent["type"]) => events.some((event) => event.type === type);

function Mark({ kind = "node" }: { kind?: "node" | "lock" | "check" | "arrow" }) {
  if (kind === "check") return <svg viewBox="0 0 24 24" aria-hidden><path d="m5 12 4 4L19 6" /></svg>;
  if (kind === "lock") return <svg viewBox="0 0 24 24" aria-hidden><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></svg>;
  if (kind === "arrow") return <svg viewBox="0 0 24 24" aria-hidden><path d="M4 12h16M15 7l5 5-5 5" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="4" /><path d="M12 2v6M12 16v6M2 12h6M16 12h6" /></svg>;
}

function Brand() {
  return <div className="v2-brand"><span className="v2-brandmark"><i /><i /><i /></span><strong>JuryAI</strong><em>Decision governance</em></div>;
}

function Header({ screen, mode }: { screen: Screen; mode?: string }) {
  const labels = { decision: "Decision intake", trial: "Independent review", review: "Human authority" };
  return <header className="v2-header"><Brand /><div className="v2-stage-label"><span>CASE JAI–LEND–0417</span><strong>{labels[screen]}</strong></div><div className="v2-trust"><i className={mode === "live" ? "live" : ""} />{mode === "live" ? "LIVE AGENTS" : mode === "fallback" ? "DEMO FALLBACK" : "EU TRUSTED ZONE"}</div></header>;
}

function DecisionScreen({ onStart }: { onStart: () => void }) {
  return <main className="v2-shell"><Header screen="decision" /><section className="v2-decision">
    <div className="v2-decision-copy"><span className="v2-kicker">A consequential AI decision</span><h1>Should an AI decision<br />stand <em>unchallenged?</em></h1><p>Put the decision through an independent, auditable process—before a human decides.</p></div>
    <div className="v2-decision-card">
      <div className="v2-case-meta"><span>CONSUMER LENDING</span><b>AUTOMATED DECISION</b></div>
      <div className="v2-applicant"><small>APPLICATION</small><strong>€18,500</strong><span>Home energy renovation</span></div>
      <div className="v2-original"><small>ORIGINAL OUTCOME</small><strong>DECLINE</strong><b>86% confidence</b><p>Payment instability + location risk</p></div>
      <button className="v2-primary v2-trial-button" onClick={onStart}>PUT DECISION ON TRIAL <Mark kind="arrow" /></button>
    </div>
    <div className="v2-preview" aria-hidden><span>AI DECISION</span><i /><span>ISOLATED REVIEW</span><i /><span>SEALED JURY</span><i /><span>HUMAN</span></div>
  </section></main>;
}

function FlowRail({ events, complete }: { events: TrialEvent[]; complete: boolean }) {
  const steps = [
    ["01", "Protect", has(events, "identity_firewall_completed")],
    ["02", "Witnesses", has(events, "witness_completed")],
    ["03", "Challenge", has(events, "counterfactual_completed")],
    ["04", "Clerk", has(events, "case_packet_created")],
    ["05", "Jury", has(events, "jury_complete")],
    ["06", "Human", complete],
  ] as const;
  const active = Math.max(0, steps.findIndex((step) => !step[2]));
  return <div className="v2-flow-rail">{steps.map(([number, label, done], index) => <div className={`${done ? "done" : ""} ${index === active ? "active" : ""}`} key={label}><span>{done ? <Mark kind="check" /> : number}</span><b>{label}</b>{index < steps.length - 1 && <i />}</div>)}</div>;
}

function EvidenceStack({ active }: { active: Role }) {
  const allowed = specialists.find((item) => item.role === active)?.allowed ?? [];
  return <div className="v2-evidence-stack"><div className="v2-column-label">ADMISSIBLE EVIDENCE</div>{scenario.caseData.evidence.map((evidence) => <article className={allowed.includes(evidence.id) ? "routed" : "dimmed"} key={evidence.id}><b>{evidence.id}</b><span>{evidence.title}</span><i>{allowed.includes(evidence.id) ? "ROUTED" : "SEALED"}</i></article>)}</div>;
}

function AgentNetwork({ events, active, setActive }: { events: TrialEvent[]; active: Role; setActive: (role: Role) => void }) {
  return <div className="v2-network">
    <div className="v2-network-orbit" aria-hidden><svg viewBox="0 0 520 340" preserveAspectRatio="none"><path d="M20 62 C130 62 138 64 224 85" /><path d="M20 160 C126 160 140 160 224 160" /><path d="M20 258 C130 258 138 256 224 235" /><path d="M296 85 C380 85 390 62 500 62" /><path d="M296 160 C390 160 406 160 500 160" /><path d="M296 235 C380 235 390 258 500 258" /></svg></div>
    <div className="v2-firewall"><Mark kind="lock" /><span>IDENTITY<br />FIREWALL</span></div>
    <div className="v2-agent-list">{specialists.map((agent) => {
      const done = events.some((event) => event.type === "finding_sealed" && event.role === agent.role);
      const working = events.some((event) => event.type === "witness_started" && event.role === agent.role) && !done;
      return <button key={agent.role} className={`${active === agent.role ? "selected" : ""} ${done ? "done" : ""} ${working ? "working" : ""}`} onClick={() => setActive(agent.role)}><span>{agent.short}</span><div><b>{agent.name}</b><small>{done ? "FINDING SEALED" : working ? "ANALYZING PACKET" : "ISOLATED SESSION"}</small></div>{done && <Mark kind="check" />}</button>;
    })}</div>
    <div className="v2-context-clear"><span>NO SHARED MEMORY</span><b>Fresh context per agent</b></div>
  </div>;
}

function FindingPanel({ run, active, events }: { run: DemoRunResult | null; active: Role; events: TrialEvent[] }) {
  const spec = specialists.find((item) => item.role === active)!;
  const finding = run?.review.findings.find((item) => item.role === active);
  const event = [...events].reverse().find((item) => item.type === "witness_completed" && item.role === active);
  const defaults: Record<Role, { result: string; tone: string }> = {
    decision_witness: { result: "Financial evidence supports affordability.", tone: "supports" },
    fact_checker: { result: "Payment-instability claim is unsupported.", tone: "warns" },
    bias_privacy_challenger: { result: "Counterfactual sensitivity detected.", tone: "warns" },
  };
  const ready = Boolean(finding || event);
  return <aside className="v2-finding">
    <div className="v2-column-label">SEALED OUTPUT</div>
    <div className="v2-contract"><span>CONTEXT CONTRACT</span><strong>{spec.allowed.join(" · ")}</strong><small>BLOCKED: {spec.blocked}</small></div>
    <div className={`v2-finding-card ${ready ? defaults[active].tone : "pending"}`}><span>{ready ? "STRUCTURED FINDING" : "WAITING FOR SEALED FINDING"}</span><strong>{ready ? (finding?.claims[0]?.statement ?? event?.summary ?? defaults[active].result) : "The agent sees only its permitted packet."}</strong>{ready && <div><Mark kind={active === "decision_witness" ? "check" : "node"} /><b>{defaults[active].result}</b></div>}</div>
    <div className="v2-no-cot"><Mark kind="lock" /><span><b>Reasoning stays private.</b><br />Only evidence-backed structured fields move forward.</span></div>
  </aside>;
}

function CompletedTrial({ run, onReview }: { run: DemoRunResult; onReview: () => void }) {
  const votes = run.review.court.jurorVotes;
  return <div className="v2-complete-grid">
    <section className="v2-results"><div className="v2-section-head"><span>INDEPENDENT FINDINGS</span><b>3 SEALED</b></div>{specialists.map((agent, index) => <article key={agent.role}><span>{agent.short}</span><div><b>{agent.name}</b><p>{scenario.witnessFindings[index]}</p></div><Mark kind="check" /></article>)}</section>
    <section className="v2-counterfactual"><div className="v2-section-head"><span>CONTROLLED CHALLENGE</span><b>EV-05</b></div><div className="v2-equation"><div><small>ORIGINAL</small><b>GEOGRAPHY</b><strong>DECLINE</strong></div><span>−</span><div><small>COUNTERFACTUAL</small><b>GEOGRAPHY</b><strong>APPROVE</strong></div></div><p>Outcome changed when postal geography was removed. Sensitivity detected—not proof of discrimination.</p></section>
    <section className="v2-jury"><div className="v2-section-head"><span>INDEPENDENT JURY</span><b>SAME FACTS · 3 VIEWS</b></div><div className="v2-jurors">{votes.map((vote, index) => <article key={vote.jurorId}><small>{["EVIDENCE-FIRST", "CLAIM / EVIDENCE", "CONTRADICTION-FIRST"][index]}</small><span>JUROR {index + 1}</span><strong>{vote.vote.replace("_", " ")}</strong></article>)}</div><div className="v2-verdict"><span>SEALED VOTES REVEALED TOGETHER</span><strong>{run.review.court.juryVerdict.split}</strong><p>Safeguard: factual issue + counterfactual sensitivity</p></div></section>
    <button className="v2-primary v2-review-cta" onClick={onReview}>OPEN HUMAN REVIEW <Mark kind="arrow" /></button>
  </div>;
}

function TrialScreen({ events, run, running, active, setActive, onReview }: { events: TrialEvent[]; run: DemoRunResult | null; running: boolean; active: Role; setActive: (role: Role) => void; onReview: () => void }) {
  return <main className="v2-shell"><Header screen="trial" mode={run?.review.mode} /><section className="v2-trial"><FlowRail events={events} complete={Boolean(run)} />
    <div className="v2-trial-heading"><div><span className="v2-kicker">{run ? "THE RECORD IS READY" : "THE SYSTEM IS WORKING"}</span><h1>{run ? "Independent findings. One accountable handoff." : "Watch the decision move—without shared context."}</h1></div><div className="v2-runtime"><i className={running ? "running" : ""} /><span>{run ? "AUDIT RECORD READY" : running ? "PROCESSING IN PARALLEL" : "STARTING"}</span></div></div>
    {run ? <CompletedTrial run={run} onReview={onReview} /> : <div className="v2-workbench"><EvidenceStack active={active} /><AgentNetwork events={events} active={active} setActive={setActive} /><FindingPanel run={run} active={active} events={events} /></div>}
  </section></main>;
}

function AskPanel({ run, events, highlight, setHighlight }: { run: DemoRunResult; events: TrialEvent[]; highlight: string; setHighlight: (value: string) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExplainabilityAnswer | null>(null);
  const ask = (value: string) => {
    const text = value.trim();
    if (!text) return;
    const next = answerFromTrialRecord(text, scenario, run, events);
    setQuestion(text); setAnswer(next); setHighlight(next.sources[0] ?? next.highlights[0] ?? "");
  };
  const submit = (event: FormEvent) => { event.preventDefault(); ask(question); };
  return <section className="v2-ask"><div className="v2-ask-head"><span>ASK JURYAI</span><b>Answers from the trial record—not hidden reasoning.</b></div>
    <form onSubmit={submit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Challenge the recommendation…" aria-label="Ask JuryAI" /><button aria-label="Submit question"><Mark kind="arrow" /></button></form>
    <div className="v2-suggestions">{prompts.map((prompt) => <button onClick={() => ask(prompt)} key={prompt}>{prompt}</button>)}</div>
    {answer ? <div className="v2-answer"><span>{answer.heading}</span>{answer.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<div><b>SOURCES</b>{answer.sources.length ? answer.sources.map((source) => <i className={highlight === source ? "active" : ""} key={source}>{source}</i>) : <i>Structured trial record</i>}</div>{answer.counterfactual && <div className="v2-mini-counter"><span>{answer.counterfactual.original}<b>{answer.counterfactual.originalResult}</b></span><Mark kind="arrow" /><span>{answer.counterfactual.changed}<b>{answer.counterfactual.changedResult}</b></span></div>}</div> : <div className="v2-empty-answer"><Mark kind="node" /><p>Ask “why?”, inspect the evidence, or challenge what the system was allowed to see.</p></div>}
  </section>;
}

function ReviewScreen({ run, events, decision, decide, restart }: { run: DemoRunResult; events: TrialEvent[]; decision: HumanDecision | null; decide: (action: HumanDecision["action"], reason: string) => void; restart: () => void }) {
  const [highlight, setHighlight] = useState("EV-04");
  const evidence = useMemo(() => scenario.caseData.evidence, []);
  if (decision) return <main className="v2-shell"><Header screen="review" mode={run.review.mode} /><section className="v2-closed"><div className="v2-seal"><Mark kind="check" /></div><span>CASE JAI–LEND–0417 · CLOSED</span><h1>{decision.action === "approved" ? "APPROVED" : decision.action === "overridden" ? "ORIGINAL DECISION UPHELD" : "FURTHER REVIEW REQUESTED"}</h1><p>Human judgment recorded. Full evidence lineage preserved.</p><div className="v2-audit-line"><b>AI decision</b><i /><b>Independent review</b><i /><b>Jury 2–1</b><i /><b>Human authority</b></div><div className="v2-governance"><span>✓ Audit record sealed</span><span>✓ 87 / 87 governance tests</span><span>✓ Human accountable</span></div><button className="v2-secondary" onClick={restart}>Run demo again</button></section></main>;
  return <main className="v2-shell"><Header screen="review" mode={run.review.mode} /><section className="v2-review"><FlowRail events={events} complete />
    <div className="v2-review-title"><div><span className="v2-kicker">PROCEDURAL SAFEGUARD TRIGGERED</span><h1>The jury recommends overturning.<br /><em>You remain the decision-maker.</em></h1></div><div className="v2-score"><span>JURY VERDICT</span><strong>2–1 OVERTURN</strong><small>HUMAN REVIEW REQUIRED</small></div></div>
    <div className="v2-review-grid"><aside className="v2-record"><div className="v2-section-head"><span>TRACEABLE RECORD</span><b>5 SOURCES</b></div>{evidence.map((item) => <button className={highlight === item.id ? "active" : ""} onClick={() => setHighlight(item.id)} key={item.id}><b>{item.id}</b><span>{item.title}</span><i>{item.verified ? "VERIFIED" : "CHECK"}</i></button>)}<div className="v2-why"><span>WHY YOU WERE CALLED</span><p>Unsupported factual claim</p><p>Postal-code sensitivity</p></div></aside>
      <AskPanel run={run} events={events} highlight={highlight} setHighlight={setHighlight} />
      <aside className="v2-authority"><div className="v2-section-head"><span>FINAL AUTHORITY</span><b>HUMAN</b></div><p>The system recommends. You decide and own the outcome.</p><button className="v2-approve" onClick={() => decide("approved", "Accepted the jury outcome after reviewing the factual and counterfactual record.")}>ACCEPT JURY OUTCOME <span>Approve application</span></button><button onClick={() => decide("overridden", "Overrode the jury recommendation and upheld the original decline.")}>OVERRIDE <span>Uphold original decline</span></button><button onClick={() => decide("review_requested", "Requested additional evidence before a final decision.")}>REQUEST FURTHER REVIEW</button><small><Mark kind="lock" /> Your action is added to the audit record.</small></aside>
    </div>
  </section></main>;
}

export function JuryDemoV2() {
  const [screen, setScreen] = useState<Screen>("decision");
  const [events, setEvents] = useState<TrialEvent[]>([]);
  const [run, setRun] = useState<DemoRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState<Role>("decision_witness");
  const [decision, setDecision] = useState<HumanDecision | null>(null);
  const controller = useRef<AbortController | null>(null);
  const start = async () => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setEvents([]); setRun(null); setDecision(null); setRunning(true); setScreen("trial");
    try {
      const response = await fetch("/api/trials/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenarioId: "lending", zoneId: "eu_trusted" }), signal: abort.signal });
      if (!response.ok || !response.body) throw new Error("Trial unavailable");
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() ?? "";
        for (const line of lines) { if (!line.trim()) continue; const event = TrialEventSchema.parse(JSON.parse(line)); setEvents((current) => [...current, event]); if (event.type === "audit_ready" && event.result) setRun(event.result); }
      }
    } catch { if (!abort.signal.aborted) setEvents((current) => [...current, { type: "trial_completed", sequence: current.length + 1, timestamp: new Date().toISOString(), status: "fallback_failed_safely", mode: "fallback" }]); }
    finally { if (!abort.signal.aborted) setRunning(false); }
  };
  const decide = (action: HumanDecision["action"], reason: string) => setDecision(HumanDecisionSchema.parse({ action, reason, decidedBy: "Human reviewer", decidedAt: new Date().toISOString() }));
  const restart = () => { controller.current?.abort(); setScreen("decision"); setEvents([]); setRun(null); setDecision(null); setRunning(false); setActive("decision_witness"); };
  if (screen === "decision") return <DecisionScreen onStart={() => void start()} />;
  if (screen === "review" && run) return <ReviewScreen run={run} events={events} decision={decision} decide={decide} restart={restart} />;
  return <TrialScreen events={events} run={run} running={running} active={active} setActive={setActive} onReview={() => setScreen("review")} />;
}
