"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { demoCase } from "@/lib/demo-case";
import { AgentReviewResultSchema, HumanDecisionSchema, type AgentReviewResult, type HumanDecision } from "@/lib/schemas";

type IconName = "scale" | "arrow" | "check" | "lock" | "alert" | "file" | "gavel" | "shield" | "refresh";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    scale: <><path d="M12 3v18M5 6h14M7 6l-4 7h8L7 6ZM17 6l-4 7h8l-4-7ZM8 21h8"/><path d="M3 13c.5 2 2 3 4 3s3.5-1 4-3M13 13c.5 2 2 3 4 3s3.5-1 4-3"/></>,
    arrow: <path d="M5 12h14M14 7l5 5-5 5"/>, check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17.5v.1"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    gavel: <><path d="m13 7 4 4M6 14l4 4M8 16l7-7M11 5l2-2 6 6-2 2M4 20h10"/></>,
    shield: <><path d="M12 3 4.5 6v5.5c0 4.7 3.1 8 7.5 9.5 4.4-1.5 7.5-4.8 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18.5 7M17.9 16A7 7 0 0 1 5.5 17"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{paths[name]}</svg>;
}

const stageNames = ["AI decision", "Evidence split", "Witnesses", "Court Clerk", "Jury", "Human Judge", "Case closed"];
const evidence = [["EV-01", "Income"], ["EV-02", "Credit"], ["EV-03", "Banking"], ["EV-04", "Context"], ["EV-05", "Profile"]] as const;

function Brand() { return <div className="brand"><span className="brand-mark"><Icon name="scale" size={24}/></span><strong>Jury<span>AI</span></strong></div>; }
function Shell({ stage, children, mode }: { stage: number; children: ReactNode; mode?: "live" | "fallback" }) {
  return <main className="demo-shell"><header className="demo-header"><Brand/><div className="case-id">CASE {demoCase.id}</div><div className="header-status"><i/>{mode === "live" ? "LIVE AGENTS" : mode === "fallback" ? "DEMO FALLBACK" : "DEMO READY"}</div></header><nav className="stage-rail" aria-label="Demo progress">{stageNames.map((name, index) => <div key={name} className={index === stage ? "active" : index < stage ? "done" : ""}><span>{index < stage ? <Icon name="check" size={12}/> : index + 1}</span><small>{name}</small></div>)}</nav><section className="demo-stage" key={stage}>{children}</section></main>;
}
function Kicker({ children }: { children: ReactNode }) { return <div className="kicker"><span/>{children}</div>; }
function Button({ children, onClick, secondary = false, icon = "arrow" }: { children: ReactNode; onClick: () => void; secondary?: boolean; icon?: IconName }) { return <button className={`demo-button ${secondary ? "secondary" : ""}`} onClick={onClick}>{children}<Icon name={icon} size={19}/></button>; }

function OriginalDecision({ start }: { start: () => void }) {
  return <div className="screen decision-screen"><Kicker>Original AI decision</Kicker><div className="applicant-line"><span>Fictional loan application</span><strong>{demoCase.applicant.name} · €{demoCase.applicant.requestedAmountEur.toLocaleString("en-US")}</strong></div><div className="decision-lockup"><span>Automated recommendation</span><h1>DECLINE</h1><div className="confidence-number">86% <small>confidence</small></div><p>Payment instability <b>+</b> location risk</p></div><button className="trial-button" onClick={start}><Icon name="scale" size={24}/> PUT DECISION ON TRIAL <Icon name="arrow" size={22}/></button><p className="micro-copy">A confident decision is not the final word.</p></div>;
}

function Compartmentalization() {
  return <div className="screen centered-screen"><Kicker>Compartmentalized review</Kicker><h1>Independent first.<br/><span>Synthesis second.</span></h1><div className="evidence-split">{evidence.map(([id, label], index) => <article key={id} style={{ "--i": index } as CSSProperties}><span><Icon name="file" size={20}/></span><strong>{id}</strong><small>{label}</small><div><Icon name="lock" size={11}/> FRESH · SEALED</div></article>)}</div><div className="processing-line"><i/><span>Separating evidence into isolated chambers</span></div></div>;
}

function Witnesses() {
  const cards = [
    { name: "Decision Witness", input: "EV-01 · EV-02 · EV-03", icon: "check" as const, tone: "positive", text: "Financial evidence supports affordability." },
    { name: "Fact Checker", input: "EV-02 · EV-03 · EV-04", icon: "alert" as const, tone: "warning", text: "Payment-instability claim unsupported." },
    { name: "Bias & Privacy Challenger", input: "EV-05 only", icon: "alert" as const, tone: "warning", text: "Counterfactual sensitivity detected." },
  ];
  return <div className="screen centered-screen"><Kicker>Independent witnesses</Kicker><h1>Three witnesses. <span>No shared conclusions.</span></h1><div className="witness-grid">{cards.map((card, index) => <article key={card.name} style={{ "--i": index } as CSSProperties}><div className="witness-top"><span>0{index + 1}</span><small><Icon name="lock" size={11}/> {card.input}</small></div><h2>{card.name}</h2><p className={card.tone}><Icon name={card.icon} size={20}/>{card.text}</p></article>)}</div><p className="stage-note"><Icon name="shield" size={15}/> Each witness saw only the evidence allowed for its task.</p></div>;
}

function CourtClerk() {
  return <div className="screen centered-screen clerk-screen"><Kicker>Deterministic Court Clerk</Kicker><div className="clerk-visual"><div className="sealed-stack">{[1,2,3].map((item) => <span key={item}><Icon name="lock" size={16}/> SEALED FINDING {item}</span>)}</div><div className="assembly-arrow"><i/><Icon name="arrow" size={26}/><i/></div><div className="case-file"><Icon name="file" size={34}/><span>STRUCTURED CASE FILE</span><strong>CP-JAI-2026-0417</strong></div></div><h1>Evidence sealed.<br/><span>Case assembled.</span></h1><p>Raw reasoning is not passed forward.</p></div>;
}

function Jury({ result, revealed, reveal, next }: { result: AgentReviewResult | null; revealed: boolean; reveal: () => void; next: () => void }) {
  useEffect(() => { const timer = window.setTimeout(reveal, 900); return () => window.clearTimeout(timer); }, [reveal]);
  const votes = result?.court.jurorVotes ?? [
    { jurorId: "J1", view: "evidence_first", vote: "overturn" }, { jurorId: "J2", view: "claim_evidence", vote: "overturn" }, { jurorId: "J3", view: "contradiction_first", vote: "human_review" },
  ];
  const split = result?.court.juryVerdict.split ?? "2–1 overturn";
  const viewLabels = { evidence_first: "Evidence-first", claim_evidence: "Claim/Evidence", contradiction_first: "Contradiction-first" } as const;
  return <div className="screen jury-screen"><Kicker>Independent Jury</Kicker><div className="jury-heading"><div><h1>{revealed ? "Votes revealed together." : "VOTES SEALED"}</h1><p>Same material facts. Three neutral presentations.</p></div><span className={`seal-state ${revealed ? "open" : ""}`}><Icon name={revealed ? "check" : "lock"} size={17}/>{revealed ? "REVEALED" : "SEALED"}</span></div><div className={`jury-grid ${revealed ? "revealed" : ""}`}>{votes.map((vote, index) => <article key={vote.jurorId}><div className="chamber-label"><span>JUROR {index + 1}</span><small>{viewLabels[vote.view]}</small></div><div className="sealed-vote"><Icon name="lock" size={28}/><span>VOTE SEALED</span></div><div className="revealed-vote"><span>{vote.vote.replace("_", " ")}</span><small><Icon name="check" size={13}/> Independent vote</small></div></article>)}</div>{revealed && <div className="jury-result"><div><span>JURY VERDICT</span><strong>{split.toUpperCase()}</strong></div><div className="safeguard"><Icon name="alert" size={20}/><p><strong>PROCEDURAL SAFEGUARD TRIGGERED</strong><span>Counterfactual sensitivity + factual issue require human review.</span></p></div><Button onClick={next}>Send to Human Judge</Button></div>}</div>;
}

function HumanJudge({ result, decide }: { result: AgentReviewResult | null; decide: (decision: HumanDecision) => void }) {
  const split = result?.court.juryVerdict.split ?? "2–1 overturn";
  const record = (action: HumanDecision["action"], reason: string) => decide(HumanDecisionSchema.parse({ action, reason, decidedBy: "A. Korhonen · Senior Credit Officer", decidedAt: new Date().toISOString() }));
  return <div className="screen judge-screen"><Kicker>Human Judge · Final authority</Kicker><div className="judge-layout"><section><span className="overline">JURY VERDICT</span><h1>{split.toUpperCase()}</h1><div className="why-called"><span>WHY YOU WERE CALLED</span><p><Icon name="alert" size={17}/> Unsupported factual claim</p><p><Icon name="alert" size={17}/> Postal-code sensitivity</p></div></section><section className="judge-actions"><div className="judge-avatar">AK</div><h2>Record final judgment</h2><p>The jury advises. You decide.</p><button className="accept-action" onClick={() => record("overridden", "Accepted the jury outcome: verified evidence supports approval and material risks in the automated decline require correction.")}><span><Icon name="check" size={20}/> Accept Jury Outcome</span><small>APPROVE APPLICATION</small></button><button onClick={() => record("approved", "Jury outcome overridden; original decline retained after independent human review.")}><Icon name="gavel" size={18}/> Override</button><button onClick={() => record("review_requested", "Further documentary review requested before final disposition.")}><Icon name="refresh" size={18}/> Request Further Review</button><small className="audit-note"><Icon name="lock" size={12}/> Decision, reason, identity, and time recorded</small></section></div></div>;
}

function CaseClosed({ decision, restart }: { decision: HumanDecision; restart: () => void }) {
  const approved = decision.action === "overridden";
  const title = approved ? "APPROVED" : decision.action === "review_requested" ? "REVIEW REQUESTED" : "DECLINE UPHELD";
  return <div className="screen closed-screen"><div className={`outcome-mark ${approved ? "approved" : ""}`}><Icon name={approved ? "check" : "gavel"} size={38}/></div><Kicker>Case closed</Kicker><h1>{title}</h1><p className="audit-sealed"><Icon name="lock" size={17}/> Audit record sealed <Icon name="check" size={16}/></p><div className="mini-timeline"><span>AI decision</span><i/><span>Independent review</span><i/><span>Jury 2–1</span><i/><strong>Human judgment</strong></div><div className="closing-grid"><div className="bob-card"><span>DEVELOPED WITH IBM BOB</span><p>Bob identified unnecessary evidence access in our Bias Challenger. We reduced its access to EV-05 only.</p></div><div className="test-card"><strong>75 / 75</strong><span>GOVERNANCE TESTS PASSED</span></div></div><Button onClick={restart} secondary icon="refresh">Run demo again</Button></div>;
}

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export function JuryDemo() {
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<AgentReviewResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [decision, setDecision] = useState<HumanDecision | null>(null);
  const runTrial = async () => {
    setStage(1); setRevealed(false);
    let review: AgentReviewResult | null = null;
    try { const response = await fetch("/api/agents", { method: "POST" }); if (!response.ok) throw new Error(); review = AgentReviewResultSchema.parse(await response.json()); } catch { review = null; }
    setResult(review); await wait(1100); setStage(2); await wait(1600); setStage(3); await wait(1000); setStage(4);
  };
  const reset = () => { setStage(0); setResult(null); setRevealed(false); setDecision(null); };
  const content = useMemo(() => {
    if (stage === 0) return <OriginalDecision start={runTrial}/>;
    if (stage === 1) return <Compartmentalization/>;
    if (stage === 2) return <Witnesses/>;
    if (stage === 3) return <CourtClerk/>;
    if (stage === 4) return <Jury result={result} revealed={revealed} reveal={() => setRevealed(true)} next={() => setStage(5)}/>;
    if (stage === 5) return <HumanJudge result={result} decide={(value) => { setDecision(value); setStage(6); }}/>;
    return decision ? <CaseClosed decision={decision} restart={reset}/> : null;
  }, [stage, result, revealed, decision]);
  return <Shell stage={stage} mode={result?.mode}>{content}</Shell>;
}
