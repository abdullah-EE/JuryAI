"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { answerFromTrialRecord, type ExplainabilityAnswer } from "@/lib/explainability";
import { scenarios } from "@/lib/scenarios";
import { HumanDecisionSchema, type AgentFinding, type HumanDecision } from "@/lib/schemas";
import { TrialEventSchema, type TrialEvent } from "@/lib/trial-event-schema";
import type { DemoRunResult } from "@/lib/compliance";

type Screen = "decision" | "trial" | "review";
type Role = AgentFinding["role"];
type CourtStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

const courtStages: Array<{ label: string; role: string; summary: string }> = [
  { label: "Bank AI", role: "Accused decision", summary: "Made the original decline at 86% confidence." },
  { label: "Firewall", role: "Court security", summary: "Removes identity before specialist review." },
  { label: "Sufficiency Gate", role: "Admissibility", summary: "Checks that every agent has enough evidence—and nothing extra." },
  { label: "Expert Witnesses", role: "Financial witnesses", summary: "Three scoped examiners test income, credit, and cash flow independently." },
  { label: "Challenges", role: "Independent challengers", summary: "Fact-checks the stated reason and tests proxy sensitivity in separate contexts." },
  { label: "Court Clerk", role: "Case assembly", summary: "Organizes sealed findings without giving an opinion." },
  { label: "AI Jury", role: "Independent jurors", summary: "Three jurors see the same facts through neutral views." },
  { label: "Human Judge", role: "Final authority", summary: "Questions the record and makes the accountable decision." },
];

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
    <div className="v2-decision-copy"><span className="v2-kicker">A consequential AI decision</span><h1>Should an AI decision<br />stand <em>unchallenged?</em></h1><p>No single AI should make a decision, justify it, and approve itself.</p></div>
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

function AgentFigure({ kind, children }: { kind: "ai" | "guard" | "gate" | "witness" | "lawyer" | "watchdog" | "clerk" | "jury" | "judge"; children?: ReactNode }) {
  if (kind === "ai") return <div className="tour-figure ai-accused"><svg viewBox="0 0 260 250" aria-hidden><path className="bench" d="M30 210h200M52 210v-34h156v34"/><rect className="machine" x="78" y="48" width="104" height="96" rx="12"/><path d="M130 22v26M116 22h28M100 83h10M150 83h10M109 112h42M67 72H45v48h22M193 72h22v48h-22"/><circle className="pulse-dot" cx="130" cy="96" r="55"/></svg>{children}</div>;
  if (kind === "gate") return <div className="tour-figure gate-figure"><svg viewBox="0 0 280 250" aria-hidden><path className="gate-post" d="M48 212V38h22v174M210 212V38h22v174M70 58h140M70 92h140M70 126h140"/><path className="packet packet-a" d="M97 61h42v28H97z"/><path className="packet packet-b" d="M144 95h42v28h-42z"/><path className="pass" d="m116 174 14 14 30-34"/></svg>{children}</div>;
  if (kind === "jury") return <div className="tour-figure jury-figure"><svg viewBox="0 0 330 250" aria-hidden>{[70,165,260].map((x) => <g key={x}><circle cx={x} cy="73" r="22"/><path d={`M${x-36} 164v-35c0-25 16-39 36-39s36 14 36 39v35M${x-45} 173h90v48h-90z`}/></g>)}<path className="sealed-line" d="M50 194h230"/></svg>{children}</div>;
  const props: Record<string, ReactNode> = {
    guard: <><path className="prop" d="M164 104v63c0 29-22 43-39 50-17-7-39-21-39-50v-63l39-15z"/><path className="prop" d="m107 148 13 13 25-29"/></>,
    witness: <><path className="prop" d="M52 200h156M69 200v-56h122v56M83 144l42-38 42 38"/><path d="M158 98h43M201 98v48"/></>,
    lawyer: <><circle className="prop" cx="178" cy="115" r="28"/><path className="prop" d="m198 136 27 28M38 190h70M48 168h50M58 146h30"/></>,
    watchdog: <><path className="prop" d="M166 111v58c0 26-20 39-36 45-16-6-36-19-36-45v-58l36-14z"/><path className="prop" d="M109 150s9-13 21-13 21 13 21 13-9 13-21 13-21-13-21-13z"/><circle cx="130" cy="150" r="5"/></>,
    clerk: <><path className="prop" d="M50 167h62v43H50zM61 154h62v56M72 141h62v69"/><path className="prop" d="M79 158h35M79 174h35M79 190h35"/></>,
    judge: <><path className="prop" d="M46 184h168v34H46zM61 184v-41h138v41M173 88l39 39M188 74l38 38M204 115l-33 33"/></>,
  };
  return <div className={`tour-figure ${kind}-figure`}><svg viewBox="0 0 260 250" aria-hidden><circle cx="130" cy="58" r="28"/><path d="M83 184v-55c0-31 20-48 47-48s47 17 47 48v55M104 183v42M156 183v42M83 128l-36 34M177 128l32 37"/>{props[kind]}</svg>{children}</div>;
}

function StageRail({ step, setStep }: { step: CourtStep; setStep: (step: CourtStep) => void }) {
  return <div className="tour-rail" aria-label="Court process">{courtStages.map((stage, index) => <button key={stage.label} className={index === step ? "active" : index < step ? "visited" : ""} onClick={() => setStep(index as CourtStep)}><span>{index + 1}</span><b>{stage.label}</b><div className="tour-tooltip"><strong>{stage.role}</strong><p>{stage.summary}</p><small>Click to inspect</small></div></button>)}</div>;
}

function StageEvidence({ ids, selected }: { ids: string[]; selected?: string }) {
  return <div className="stage-evidence">{scenario.caseData.evidence.map((item) => <div key={item.id} className={`${ids.includes(item.id) ? "included" : "excluded"} ${selected === item.id ? "selected" : ""}`}><b>{item.id}</b><span>{item.title}</span><small>{ids.includes(item.id) ? "ADMITTED" : "SEALED"}</small></div>)}</div>;
}

function ExpertWitnesses() {
  const witnesses = [
    { evidence: "EV-01", name: "Income examiner", focus: "Income + employment", result: "VERIFIED" },
    { evidence: "EV-02", name: "Credit examiner", focus: "Credit history", result: "STABLE" },
    { evidence: "EV-03", name: "Cash-flow examiner", focus: "Payment history", result: "AFFORDABLE" },
  ];
  return <div className="expert-witnesses" aria-label="Three financial expert witnesses">
    {witnesses.map((witness) => <article key={witness.evidence} tabIndex={0} aria-label={`${witness.name}: ${witness.focus}, ${witness.result}`}>
      <span>{witness.evidence}</span>
      <svg viewBox="0 0 90 100" aria-hidden><circle cx="45" cy="25" r="13" /><path d="M22 78V58c0-15 9-23 23-23s23 8 23 23v20M13 84h64M29 96V78M61 96V78" /><path className="witness-signal" d="M8 40h13M69 40h13" /></svg>
      <b>{witness.name}</b>
      <small>{witness.focus}</small>
      <strong>{witness.result}</strong>
    </article>)}
    <div className="witness-seal"><span>3 ISOLATED EXAMINATIONS</span><b>DECISION WITNESS FINDING SEALED</b></div>
  </div>;
}

function IndependentChallenges() {
  return <div className="challenge-duo" aria-label="Two independent challenge agents">
    <article tabIndex={0} aria-label="Fact Checker: payment-instability claim unsupported">
      <svg viewBox="0 0 100 110" aria-hidden><circle cx="50" cy="27" r="14" /><path d="M25 84V61c0-16 10-25 25-25s25 9 25 25v23M17 91h66M33 104V84M67 104V84" /><circle className="challenge-prop" cx="76" cy="38" r="12" /><path className="challenge-prop" d="m84 47 10 11" /></svg>
      <span>FACT CHECKER</span><b>Claim unsupported</b><small>EV-02 · EV-03 · EV-04</small>
    </article>
    <i>ISOLATED</i>
    <article tabIndex={0} aria-label="Privacy Watchdog: counterfactual sensitivity detected">
      <svg viewBox="0 0 100 110" aria-hidden><circle cx="50" cy="27" r="14" /><path d="M25 84V61c0-16 10-25 25-25s25 9 25 25v23M17 91h66M33 104V84M67 104V84" /><path className="challenge-prop" d="M50 49 68 56v20c0 13-11 20-18 23-7-3-18-10-18-23V56z" /></svg>
      <span>PRIVACY WATCHDOG</span><b>Sensitivity detected</b><small>EV-05 ONLY</small>
    </article>
  </div>;
}

function ChallengeInputs() {
  return <div className="challenge-inputs">
    <div><span>FACTUAL PACKET</span><b>EV-02 · EV-03 · EV-04</b><small>Payment-risk claim</small></div>
    <div><span>PRIVACY PACKET</span><b>EV-05</b><small>Postal geography test</small></div>
  </div>;
}

function CourtroomStage({ step, run, selectedEvidence }: { step: CourtStep; run: DemoRunResult | null; selectedEvidence?: string }) {
  const finding = (role: Role) => run?.review.findings.find((item) => item.role === role);
  const stages: Record<CourtStep, ReactNode> = {
    0: <><div className="stage-side"><span>ORIGINAL CALL</span><strong className="danger">DECLINE</strong><p>“Payment instability + location risk”</p></div><AgentFigure kind="ai"><div className="figure-label"><b>BANK AI</b><span>THE ACCUSED DECISION</span></div></AgentFigure><div className="stage-side outcome"><span>WHAT IS ON TRIAL?</span><strong>86%</strong><p>One model made the call and explained its own call.</p></div></>,
    1: <><div className="identity-stream"><span className="blocked">NAME</span><span className="blocked">AGE</span><span className="blocked">IDENTITY</span></div><AgentFigure kind="guard"><div className="figure-label"><b>IDENTITY FIREWALL</b><span>COURT SECURITY</span></div></AgentFigure><div className="stage-side safe"><span>REVIEW IDENTITY</span><strong>SUB-0417</strong><p>Only purpose-limited fields pass.</p></div></>,
    2: <><StageEvidence ids={["EV-01", "EV-02", "EV-03"]} selected={selectedEvidence}/><AgentFigure kind="gate"><div className="figure-label"><b>SUFFICIENCY GATE</b><span>EVIDENCE ADMISSIBILITY</span></div></AgentFigure><div className="stage-side safe"><span>DECISION</span><strong>PASS</strong><p>Enough evidence to answer. Extra evidence remains sealed.</p></div></>,
    3: <><StageEvidence ids={["EV-01", "EV-02", "EV-03"]} selected={selectedEvidence}/><ExpertWitnesses /><div className="stage-side finding"><span>COMBINED SEALED FINDING</span><strong>SUPPORTS AFFORDABILITY</strong><p>{finding("decision_witness")?.claims[0]?.statement ?? "Financial evidence supports affordability."}</p></div></>,
    4: <><ChallengeInputs /><IndependentChallenges /><div className="challenge-results"><div><span>FACT CHECK</span><strong>UNSUPPORTED</strong><small>Bank migration explains the late transfers.</small></div><div><span>PRIVACY TEST</span><strong>SENSITIVE</strong><small>Removing geography changed the outcome.</small></div><p>Material risks found—not proof of discrimination.</p></div></>,
    5: <><div className="sealed-stack"><span>WITNESS</span><span>FACT CHECK</span><span>PRIVACY</span></div><AgentFigure kind="clerk"><div className="figure-label"><b>COURT CLERK</b><span>NEUTRAL CASE ASSEMBLY</span></div></AgentFigure><div className="stage-side safe"><span>CASE PACKET</span><strong>SEALED</strong><p>References checked. No opinion added. Raw reasoning excluded.</p></div></>,
    6: <><div className="jury-views"><span>EVIDENCE-FIRST</span><span>CLAIM / EVIDENCE</span><span>CONTRADICTION-FIRST</span></div><AgentFigure kind="jury"><div className="figure-label"><b>AI JURY</b><span>INDEPENDENT · SEALED VOTES</span></div></AgentFigure><div className="stage-side verdict"><span>REVEALED TOGETHER</span><strong>{run?.review.court.juryVerdict.split ?? "2–1 OVERTURN"}</strong><p>Same material facts. Different neutral views. No debate.</p></div></>,
    7: <><div className="judge-brief"><span>JURY</span><strong>2–1 OVERTURN</strong><span>SAFEGUARD</span><strong>REVIEW REQUIRED</strong></div><AgentFigure kind="judge"><div className="figure-label"><b>HUMAN JUDGE</b><span>FINAL AUTHORITY</span></div></AgentFigure><div className="stage-side safe"><span>ACCOUNTABILITY</span><strong>HUMAN</strong><p>Question the record. Accept, override, or request more evidence.</p></div></>,
  };
  return <div className="court-stage"><div className="stage-question"><span>{String(step + 1).padStart(2, "0")} · {courtStages[step].role}</span><h1>{step === 0 ? "The decision enters the courtroom." : step === 1 ? "Identity stops at the door." : step === 2 ? "Is the evidence admissible?" : step === 3 ? "What does each financial record establish?" : step === 4 ? "Do the reason and data survive challenge?" : step === 5 ? "Can sealed findings become a neutral case?" : step === 6 ? "What do independent jurors conclude?" : "A human makes the final call."}</h1></div><div className="stage-scene">{stages[step]}</div><div className="stage-principle"><span>THE RULE</span><strong>{step < 3 ? "Minimum necessary evidence." : step < 5 ? "Independent first. Synthesis second." : step < 7 ? "Findings are sealed before judgment." : "AI recommends. A human decides."}</strong></div></div>;
}

function TourControls({ step, setStep, onReview, ready }: { step: CourtStep; setStep: (step: CourtStep) => void; onReview: () => void; ready: boolean }) {
  return <nav className="tour-controls"><button disabled={step === 0} onClick={() => setStep((step - 1) as CourtStep)} aria-label="Previous stage"><Mark kind="arrow" /><span>BACK</span></button><div><b>{step + 1}</b><span>/ 8</span></div>{step === 7 ? <button className="next" disabled={!ready} onClick={onReview}><span>{ready ? "OPEN HUMAN REVIEW" : "ASSEMBLING RECORD"}</span><Mark kind="arrow" /></button> : <button className="next" onClick={() => setStep((step + 1) as CourtStep)}><span>NEXT</span><Mark kind="arrow" /></button>}</nav>;
}

// Kept as a compact fallback renderer for older embedded demos.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function TrialScreen({ events, run, running, active, setActive, onReview }: { events: TrialEvent[]; run: DemoRunResult | null; running: boolean; active: Role; setActive: (role: Role) => void; onReview: () => void }) {
  return <main className="v2-shell"><Header screen="trial" mode={run?.review.mode} /><section className="v2-trial"><FlowRail events={events} complete={Boolean(run)} />
    <div className="v2-trial-heading"><div><span className="v2-kicker">{run ? "THE RECORD IS READY" : "THE SYSTEM IS WORKING"}</span><h1>{run ? "Independent findings. One accountable handoff." : "Watch the decision move—without shared context."}</h1></div><div className="v2-runtime"><i className={running ? "running" : ""} /><span>{run ? "AUDIT RECORD READY" : running ? "PROCESSING IN PARALLEL" : "STARTING"}</span></div></div>
    {run ? <CompletedTrial run={run} onReview={onReview} /> : <div className="v2-workbench"><EvidenceStack active={active} /><AgentNetwork events={events} active={active} setActive={setActive} /><FindingPanel run={run} active={active} events={events} /></div>}
  </section></main>;
}

function CourtTourScreen({ run, running, step, setStep, selectedEvidence, onReview }: { run: DemoRunResult | null; running: boolean; step: CourtStep; setStep: (step: CourtStep) => void; selectedEvidence?: string; onReview: () => void }) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches("button,input,textarea")) return;
      if (event.key === "ArrowLeft" && step > 0) setStep((step - 1) as CourtStep);
      if (event.key === "ArrowRight" && step < 7) setStep((step + 1) as CourtStep);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [step, setStep]);
  return <main className="v2-shell"><Header screen="trial" mode={run?.review.mode} /><section className="tour-shell"><div className="tour-top"><StageRail step={step} setStep={setStep} /><div className="v2-runtime"><i className={running ? "running" : ""} /><span>{run ? "RECORD READY" : running ? "AGENTS WORKING" : "DEMO FALLBACK"}</span></div></div><CourtroomStage step={step} run={run} selectedEvidence={selectedEvidence} /><TourControls step={step} setStep={setStep} onReview={onReview} ready={Boolean(run)} /></section></main>;
}

function AskPanel({ run, events, highlight, setHighlight, onTrace }: { run: DemoRunResult; events: TrialEvent[]; highlight: string; setHighlight: (value: string) => void; onTrace: (step: CourtStep, evidence?: string) => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<ExplainabilityAnswer | null>(null);
  const sourceStep = (source: string): CourtStep => source === "EV-05" || source === "EV-04" ? 4 : 3;
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
    {answer ? <div className="v2-answer"><span>{answer.heading}</span>{answer.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}<div><b>SOURCES · CLICK TO TRACE</b>{answer.sources.length ? answer.sources.map((source) => <button className={highlight === source ? "active" : ""} key={source} onClick={() => onTrace(sourceStep(source), source)}>{source}<small>↗</small></button>) : <button onClick={() => onTrace(5)}>CasePacket <small>↗</small></button>}</div>{answer.counterfactual && <button className="v2-mini-counter" onClick={() => onTrace(4, "EV-05")}><span>{answer.counterfactual.original}<b>{answer.counterfactual.originalResult}</b></span><Mark kind="arrow" /><span>{answer.counterfactual.changed}<b>{answer.counterfactual.changedResult}</b></span></button>}</div> : <div className="v2-empty-answer"><Mark kind="node" /><p>Ask “why?”, inspect the evidence, or challenge what the system was allowed to see.</p></div>}
  </section>;
}

function ReviewScreen({ run, events, decision, decide, restart, onTrace }: { run: DemoRunResult; events: TrialEvent[]; decision: HumanDecision | null; decide: (action: HumanDecision["action"], reason: string) => void; restart: () => void; onTrace: (step: CourtStep, evidence?: string) => void }) {
  const [highlight, setHighlight] = useState("EV-04");
  const evidence = useMemo(() => scenario.caseData.evidence, []);
  if (decision) return <main className="v2-shell"><Header screen="review" mode={run.review.mode} /><section className="v2-closed"><div className="v2-seal"><Mark kind="check" /></div><span>CASE JAI–LEND–0417 · CLOSED</span><h1>{decision.action === "approved" ? "APPROVED" : decision.action === "overridden" ? "ORIGINAL DECISION UPHELD" : "FURTHER REVIEW REQUESTED"}</h1><p>Human judgment recorded. Full evidence lineage preserved.</p><div className="v2-audit-line"><b>AI decision</b><i /><b>Independent review</b><i /><b>Jury 2–1</b><i /><b>Human authority</b></div><div className="v2-governance"><span>✓ Audit record sealed</span><span>✓ 87 / 87 governance tests</span><span>✓ Human accountable</span></div><button className="v2-secondary" onClick={restart}>Run demo again</button></section></main>;
  return <main className="v2-shell"><Header screen="review" mode={run.review.mode} /><section className="v2-review"><FlowRail events={events} complete />
    <div className="v2-review-title"><div><span className="v2-kicker">PROCEDURAL SAFEGUARD TRIGGERED</span><h1>The jury recommends overturning.<br /><em>You remain the decision-maker.</em></h1></div><div className="v2-score"><span>JURY VERDICT</span><strong>2–1 OVERTURN</strong><small>HUMAN REVIEW REQUIRED</small></div></div>
    <div className="v2-review-grid"><aside className="v2-record"><div className="v2-section-head"><span>TRACEABLE RECORD</span><b>CLICK TO REPLAY</b></div>{evidence.map((item) => <button className={highlight === item.id ? "active" : ""} onMouseEnter={() => setHighlight(item.id)} onFocus={() => setHighlight(item.id)} onClick={() => onTrace(item.id === "EV-05" || item.id === "EV-04" ? 4 : 3, item.id)} key={item.id}><b>{item.id}</b><span>{item.title}</span><i>TRACE ↗</i></button>)}<div className="v2-why"><span>WHY YOU WERE CALLED</span><button onClick={() => onTrace(4, "EV-04")}>Unsupported factual claim <b>↗</b></button><button onClick={() => onTrace(4, "EV-05")}>Postal-code sensitivity <b>↗</b></button><button onClick={() => onTrace(6)}>Jury disagreement <b>↗</b></button></div></aside>
      <AskPanel run={run} events={events} highlight={highlight} setHighlight={setHighlight} onTrace={onTrace} />
      <aside className="v2-authority"><div className="v2-section-head"><span>FINAL AUTHORITY</span><b>HUMAN</b></div><p>The system recommends. You decide and own the outcome.</p><button className="v2-approve" onClick={() => decide("approved", "Accepted the jury outcome after reviewing the factual and counterfactual record.")}>ACCEPT JURY OUTCOME <span>Approve application</span></button><button onClick={() => decide("overridden", "Overrode the jury recommendation and upheld the original decline.")}>OVERRIDE <span>Uphold original decline</span></button><button onClick={() => decide("review_requested", "Requested additional evidence before a final decision.")}>REQUEST FURTHER REVIEW</button><small><Mark kind="lock" /> Your action is added to the audit record.</small></aside>
    </div>
  </section></main>;
}

export function JuryDemoV2() {
  const [screen, setScreen] = useState<Screen>("decision");
  const [events, setEvents] = useState<TrialEvent[]>([]);
  const [run, setRun] = useState<DemoRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<CourtStep>(1);
  const [selectedEvidence, setSelectedEvidence] = useState<string>();
  const [decision, setDecision] = useState<HumanDecision | null>(null);
  const controller = useRef<AbortController | null>(null);
  const start = async () => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setEvents([]); setRun(null); setDecision(null); setRunning(true); setStep(1); setSelectedEvidence(undefined); setScreen("trial");
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
  const restart = () => { controller.current?.abort(); setScreen("decision"); setEvents([]); setRun(null); setDecision(null); setRunning(false); setStep(1); setSelectedEvidence(undefined); };
  const trace = (target: CourtStep, evidence?: string) => { setStep(target); setSelectedEvidence(evidence); setScreen("trial"); };
  if (screen === "decision") return <DecisionScreen onStart={() => void start()} />;
  if (screen === "review" && run) return <ReviewScreen run={run} events={events} decision={decision} decide={decide} restart={restart} onTrace={trace} />;
  return <CourtTourScreen run={run} running={running} step={step} setStep={(target) => { setStep(target); setSelectedEvidence(undefined); }} selectedEvidence={selectedEvidence} onReview={() => setScreen("review")} />;
}
