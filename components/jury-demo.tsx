"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { demoCase } from "@/lib/demo-case";
import { mockFindings } from "@/lib/mock-agents";
import { deliberate } from "@/lib/jury";
import { generateReport } from "@/lib/report";
import { runDemoPostalCounterfactual } from "@/lib/counterfactual";
import { getEscalationReasons } from "@/lib/escalation";
import { AgentReviewResultSchema, HumanDecisionSchema, type AgentFinding, type CounterfactualResult, type CourtProcessResult, type EvidenceSource, type HumanDecision, type JuryResult } from "@/lib/schemas";

type IconName =
  | "scale" | "file" | "brain" | "shield" | "users" | "gavel" | "report"
  | "arrow" | "check" | "lock" | "spark" | "alert" | "eye" | "x" | "building"
  | "wallet" | "credit" | "clock" | "fingerprint" | "chevron" | "refresh" | "download"
  | "link" | "info" | "search" | "balance" | "person" | "database";

function Icon({ name, size = 18, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const paths: Record<IconName, ReactNode> = {
    scale: <><path d="M12 3v18M5 6h14M7 6l-4 7h8L7 6ZM17 6l-4 7h8l-4-7ZM8 21h8"/><path d="M3 13c.5 2 2 3 4 3s3.5-1 4-3M13 13c.5 2 2 3 4 3s3.5-1 4-3"/></>,
    file: <><path d="M6 2h8l4 4v16H6z"/><path d="M14 2v5h5M9 12h6M9 16h6"/></>,
    brain: <><path d="M9.5 4.5A3 3 0 0 0 5 7a3 3 0 0 0-1 5.5A3.5 3.5 0 0 0 8 18v1a2 2 0 0 0 4 0V6a3 3 0 0 0-2.5-1.5Z"/><path d="M14.5 4.5A3 3 0 0 1 19 7a3 3 0 0 1 1 5.5A3.5 3.5 0 0 1 16 18v1a2 2 0 0 1-4 0V6a3 3 0 0 1 2.5-1.5ZM8 10h4M12 14h4"/></>,
    shield: <><path d="M12 3 4.5 6v5.5c0 4.7 3.1 8 7.5 9.5 4.4-1.5 7.5-4.8 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M3.5 20v-1.5A4.5 4.5 0 0 1 8 14h2a4.5 4.5 0 0 1 4.5 4.5V20M16 5.5a3 3 0 0 1 0 5.5M17 14a4.5 4.5 0 0 1 3.5 4.4V20"/></>,
    gavel: <><path d="m13 7 4 4M6 14l4 4M8 16l7-7M11 5l2-2 6 6-2 2M4 20h10"/></>,
    report: <><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/><path d="m15 17 1.5 1.5L20 15"/></>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    spark: <><path d="m12 3 1.2 4.8L18 9l-4.8 1.2L12 15l-1.2-4.8L6 9l4.8-1.2L12 3Z"/><path d="m19 15 .6 2.4L22 18l-2.4.6L19 21l-.6-2.4L16 18l2.4-.6L19 15Z"/></>,
    alert: <><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17.5v.1"/></>,
    eye: <><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></>,
    x: <><path d="m6 6 12 12M18 6 6 18"/></>,
    building: <><path d="M4 21h16M6 21V8h12v13M9 11h2M13 11h2M9 15h2M13 15h2M9 21v-3h6v3M8 8V4h8v4"/></>,
    wallet: <><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H18v16H5.5A2.5 2.5 0 0 1 3 17.5v-11Z"/><path d="M3 7h15M14 11h7v5h-7a2.5 2.5 0 0 1 0-5Z"/></>,
    credit: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    fingerprint: <><path d="M6.5 9a6 6 0 0 1 11 3c0 3-1 6-2.5 8M9 20c1.2-2 1.5-4.3 1.5-7a1.5 1.5 0 0 1 3 0c0 2.4-.3 4.7-1 7M5 17c.5-1.5.5-3 .5-5a6.5 6.5 0 0 1 .3-2"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8A7 7 0 0 1 18.5 7M17.9 16A7 7 0 0 1 5.5 17"/></>,
    download: <><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    balance: <><path d="M12 4v16M6 7h12M8 7l-3 6h6L8 7ZM16 7l-3 6h6l-3-6ZM8 20h8"/></>,
    person: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

const steps = [
  { label: "Case intake", icon: "file" as const },
  { label: "Initial AI decision", icon: "brain" as const },
  { label: "Blind testimony", icon: "shield" as const },
  { label: "Jury deliberation", icon: "users" as const },
  { label: "Human judge", icon: "gavel" as const },
  { label: "Case report", icon: "report" as const },
];

const roleMeta = {
  decision_witness: { number: "01", short: "Eligibility assessment", tone: "blue" },
  fact_checker: { number: "02", short: "Claim verification", tone: "green" },
  bias_privacy_challenger: { number: "03", short: "Fairness stress test", tone: "amber" },
};

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark"><Icon name="scale" size={22} /></div>
      <div><div className="brand-name">Jury<span>AI</span></div><div className="brand-tagline">Decision integrity layer</div></div>
    </div>
  );
}

function AppButton({ children, onClick, variant = "primary", disabled = false, icon = "arrow", type = "button" }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "danger" | "ghost"; disabled?: boolean; icon?: IconName | null; type?: "button" | "submit";
}) {
  return <button type={type} className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{children}{icon && <Icon name={icon} size={17} />}</button>;
}

function Confidence({ value, color = "teal" }: { value: number; color?: "teal" | "amber" | "red" }) {
  return (
    <div className="confidence">
      <div className="confidence-line"><span>Confidence</span><strong>{Math.round(value * 100)}%</strong></div>
      <div className="meter"><span className={`meter-${color}`} style={{ width: `${value * 100}%` }} /></div>
    </div>
  );
}

function StageHeading({ eyebrow, title, body, aside }: { eyebrow: string; title: string; body: string; aside?: ReactNode }) {
  return (
    <div className="stage-heading">
      <div>
        <div className="eyebrow"><span />{eyebrow}</div>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
      {aside}
    </div>
  );
}

function ProgressRail({ current }: { current: number }) {
  return (
    <aside className="rail">
      <div className="rail-inner">
        <Brand />
        <nav aria-label="Case progress" className="steps">
          {steps.map((step, index) => (
            <div key={step.label} className={`step ${index === current ? "active" : ""} ${index < current ? "complete" : ""}`}>
              <div className="step-icon">{index < current ? <Icon name="check" size={16} /> : <Icon name={step.icon} size={17} />}</div>
              <div><span>0{index + 1}</span><strong>{step.label}</strong></div>
              {index < steps.length - 1 && <i />}
            </div>
          ))}
        </nav>
        <div className="rail-principle">
          <Icon name="balance" size={20} />
          <p>AI should not be judge, jury, and witness.</p>
          <span>JURYAI PRINCIPLE 01</span>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ stage }: { stage: number }) {
  return (
    <header className="topbar">
      <div className="mobile-brand"><Brand /></div>
      <div className="case-reference"><span>ACTIVE CASE</span><strong>{demoCase.id}</strong></div>
      <div className="topbar-right">
        <div className="stage-count">Step {stage + 1} <span>/ 6</span></div>
        <div className="demo-pill"><i /> Offline demo</div>
        <div className="avatar">AK</div>
      </div>
    </header>
  );
}

function CaseIntake({ next }: { next: () => void }) {
  const a = demoCase.applicant;
  return (
    <div className="screen-enter">
      <StageHeading eyebrow="Case intake" title="A decision is ready for review." body="Review the applicant and source evidence before submitting the case to the lender's decision model." aside={<div className="status-stamp"><span>INTAKE STATUS</span><strong><i /> Ready to submit</strong></div>} />

      <div className="case-hero">
        <div className="profile-block">
          <div className="profile-avatar">EL</div>
          <div><div className="mini-label">APPLICANT</div><h2>{a.name}</h2><p>{a.occupation} · {a.employmentYears} years employed</p></div>
        </div>
        <div className="hero-divider" />
        <div className="amount-block"><div className="mini-label">REQUESTED FACILITY</div><strong>€{a.requestedAmountEur.toLocaleString("en-US")}</strong><p>{a.loanPurpose}</p></div>
        <div className="risk-summary"><span>Risk tier</span><strong>B · Standard</strong><small>Pre-assessment only</small></div>
      </div>

      <div className="metric-grid">
        <div className="metric-card"><span className="metric-icon blue"><Icon name="wallet" /></span><div><small>MONTHLY INCOME</small><strong>€{a.monthlyIncomeEur.toLocaleString("en-US")}</strong><p>Verified · 24 months</p></div></div>
        <div className="metric-card"><span className="metric-icon green"><Icon name="credit" /></span><div><small>CREDIT SCORE</small><strong>{a.creditScore}</strong><p>Good · No defaults</p></div></div>
        <div className="metric-card"><span className="metric-icon amber"><Icon name="balance" /></span><div><small>DEBT-TO-INCOME</small><strong>{Math.round(a.debtToIncomeRatio * 100)}%</strong><p>Below 36% guideline</p></div></div>
        <div className="metric-card"><span className="metric-icon slate"><Icon name="building" /></span><div><small>EMPLOYMENT</small><strong>{a.employmentYears} yrs</strong><p>Permanent contract</p></div></div>
      </div>

      <section className="panel evidence-panel">
        <div className="panel-heading"><div><span className="mini-label">CASE FILE</span><h3>Evidence sources</h3></div><div className="verified-count"><Icon name="shield" size={15} /> {demoCase.evidence.length} sources verified</div></div>
        <div className="evidence-list">
          {demoCase.evidence.map((evidence) => <EvidenceRow key={evidence.id} evidence={evidence} />)}
        </div>
      </section>

      <div className="action-bar">
        <div><Icon name="lock" size={18} /><p><strong>Local deterministic demo</strong><span>No applicant data leaves this device</span></p></div>
        <AppButton onClick={next}>Submit to AI</AppButton>
      </div>
    </div>
  );
}

function EvidenceRow({ evidence, compact = false }: { evidence: EvidenceSource; compact?: boolean }) {
  const icon: IconName = evidence.category === "income" ? "wallet" : evidence.category === "credit" ? "credit" : evidence.category === "banking" ? "database" : evidence.category === "context" ? "file" : "person";
  return (
    <div className={`evidence-row ${compact ? "compact" : ""}`}>
      <span className="source-icon"><Icon name={icon} size={18} /></span>
      <div className="source-main"><strong>{evidence.title}</strong><span>{evidence.provider}</span></div>
      {!compact && <div className="source-summary">{evidence.summary}</div>}
      <div className="source-status"><span><Icon name="check" size={12} /> Verified</span><small>{evidence.id}</small></div>
    </div>
  );
}

function InitialDecision({ next, loading }: { next: () => void; loading: boolean }) {
  const decision = demoCase.initialDecision;
  return (
    <div className="screen-enter">
      <StageHeading eyebrow="Initial AI decision" title="The model has reached a decision." body="This is the kind of confident, plausible recommendation a normal automated workflow might accept without challenge." aside={<div className="model-chip"><Icon name="brain" size={16} /><div><span>DECISION MODEL</span><strong>{decision.model}</strong></div></div>} />

      <section className="decision-card">
        <div className="decision-top">
          <div className="decision-seal"><Icon name="x" size={28} /></div>
          <div><span className="mini-label">AUTOMATED RECOMMENDATION</span><h2>Decline application</h2><p>The application exceeds the model&apos;s acceptable repayment-risk threshold.</p></div>
          <div className="confidence-badge"><strong>86%</strong><span>confidence</span></div>
        </div>
        <div className="decision-body">
          <div className="rationale-column">
            <div className="section-label">MODEL RATIONALE</div>
            {decision.rationale.map((item, index) => <div className="rationale-item" key={item}><span>{index + 1}</span><p>{item}</p></div>)}
          </div>
          <div className="decision-side">
            <div className="section-label">INPUTS CONSIDERED</div>
            <div className="tag-cloud">{decision.dataUsed.map((item) => <span key={item}>{item}</span>)}</div>
            <div className="policy-box"><Icon name="check" size={16} /><div><strong>Policy check passed</strong><span>Automated threshold applied</span></div></div>
          </div>
        </div>
        <div className="decision-foot"><Icon name="info" size={17} /><p><strong>This decision looks internally consistent.</strong> But its claims, evidence use, and fairness have not yet been independently tested.</p></div>
      </section>

      <section className="trial-invitation">
        <div className="trial-icon"><Icon name="scale" size={25} /></div>
        <div><span className="mini-label">SECOND-ORDER REVIEW</span><h3>Should one model get the final word?</h3><p>Open an AI Court to test the decision through independent testimony, factual challenge, and human judgment.</p></div>
        <AppButton onClick={next} disabled={loading} icon={loading ? "spark" : "arrow"}>{loading ? "Calling isolated agents…" : "Put decision on trial"}</AppButton>
      </section>
    </div>
  );
}

function BlindCourt({ next, findings, mode, counterfactual, court }: { next: () => void; findings: AgentFinding[]; mode: "live" | "fallback"; counterfactual: CounterfactualResult; court: CourtProcessResult | null }) {
  return (
    <div className="screen-enter">
      <StageHeading eyebrow="JuryAI court" title="Independent testimony, by design." body="Each agent received only the evidence needed for its task. Their first conclusions were sealed from one another to reduce anchoring." aside={<div className="agent-statuses"><div className={`agent-mode agent-mode-${mode}`}><i />{mode === "live" ? "Live agents" : "Demo fallback"}</div><div className="sealed-badge"><Icon name="lock" size={16} /> Testimony sealed</div></div>} />

      <div className="blind-banner">
        <div className="blind-orbit"><span>1</span><i /><span>2</span><i /><span>3</span></div>
        <div><strong>Blind testimony protocol active</strong><p>Agents cannot see each other&apos;s identity, reasoning, or initial conclusions.</p></div>
        <div className="protocol-id">PROTOCOL <strong>BT-01</strong></div>
      </div>

      {court && <section className="micro-ledger panel">
        <div className="panel-heading"><div><span className="mini-label">SEALED EVIDENCE MICRO-SESSIONS</span><h3>Evidence examined independently</h3></div><span className="verified-count"><Icon name="lock" size={14} /> {court.ledger.entries.length} sealed findings</span></div>
        <div className="micro-grid">{court.ledger.entries.map((entry) => <div key={entry.evidenceId}><strong>{entry.evidenceId}</strong><p>{entry.finding}</p><small>{entry.supportStatus} · {Math.round(entry.confidence * 100)}%</small></div>)}</div>
        <div className="clerk-line"><Icon name="file" size={15} /><span>Court Clerk validated and deduplicated the ledger, then assembled neutral packet {court.casePacket.packetId}.</span></div>
      </section>}

      <div className={`counterfactual-strip ${counterfactual.changedOutcome ? "detected" : "stable"}`}>
        <span><Icon name={counterfactual.changedOutcome ? "alert" : "check"} size={17} /></span>
        <div><strong>{counterfactual.changedOutcome ? "Counterfactual sensitivity detected" : "No counterfactual outcome change"}</strong><p>Postal code neutralized · {counterfactual.baselineRecommendation} → {counterfactual.counterfactualRecommendation}</p></div>
        <small>EXECUTED CHECK</small>
      </div>

      <div className="agent-grid">
        {findings.map((finding) => {
          const meta = roleMeta[finding.role];
          return (
            <article className={`agent-card agent-${meta.tone}`} key={finding.agentId}>
              <div className="agent-header">
                <div className="agent-number">{meta.number}</div>
                <div><span>{meta.short}</span><h3>{finding.displayName}</h3></div>
                <div className="isolated"><Icon name="lock" size={12} /> ISOLATED</div>
              </div>
              <div className="input-envelope"><span><Icon name="fingerprint" size={15} /> SEALED INPUT</span><p>{finding.sealedInputDescription}</p></div>
              <div className="finding-call"><span>FINDING</span><strong>{finding.recommendation}</strong></div>
              <div className="claims">
                {finding.claims.map((claim) => <div className={`claim claim-${claim.status}`} key={claim.id}><span><Icon name={claim.status === "unsupported" ? "alert" : "check"} size={13} /></span><p>{claim.statement}</p></div>)}
              </div>
              {finding.risks.length > 0 && <div className="risk-mini"><Icon name="alert" size={15} /><span>{finding.risks.length} material {finding.risks.length === 1 ? "issue" : "issues"} flagged</span></div>}
              <Confidence value={finding.confidence} color={meta.tone === "amber" ? "amber" : "teal"} />
              <div className="agent-footer"><span>{finding.evidenceReferences.length} evidence sources</span><span>{finding.dataUsed.length} fields used</span></div>
            </article>
          );
        })}
      </div>

      <div className="court-summary">
        <div><Icon name="spark" size={20} /><p><strong>Independent testimony complete</strong><span>The Clerk has indexed {findings.reduce((sum, finding) => sum + finding.claims.length, 0)} claims, {findings.reduce((sum, finding) => sum + finding.risks.length, 0)} risk flags, and {findings.reduce((sum, finding) => sum + finding.evidenceReferences.length, 0)} evidence links.</span></p></div>
        <AppButton onClick={next}>Convene the jury</AppButton>
      </div>
    </div>
  );
}

function JuryDeliberation({ next, findings, court }: { next: () => void; findings: AgentFinding[]; court: CourtProcessResult | null }) {
  const result = useMemo(() => deliberate(findings), [findings]);
  return (
    <div className="screen-enter">
      <StageHeading eyebrow="Jury deliberation" title="Agreement is not the same as reliability." body="The Court Clerk compared testimony claim by claim. Serious issues trigger human review even when other signals agree." aside={<div className="clerk-chip"><Icon name="file" size={16} /><div><span>COURT CLERK</span><strong>Case file reconciled</strong></div></div>} />

      <div className="jury-verdict">
        <div className="verdict-icon"><Icon name="gavel" size={27} /></div>
        <div className="verdict-copy"><span className="mini-label">JURY VERDICT</span><h2>{court ? court.juryVerdict.split : "Human review required"}</h2><p>{court?.juryVerdict.judicialReviewRequired ? "Jury verdict reached — judicial review required." : result.rationale}</p></div>
        <div className="verdict-confidence"><span>Jury confidence</span><strong>{Math.round(result.confidence * 100)}%</strong><div className="meter"><i style={{ width: `${result.confidence * 100}%` }} /></div></div>
      </div>

      {court && <div className="juror-grid">{court.jurorVotes.map((vote) => <article className="panel juror-card" key={vote.jurorId}><span><Icon name="lock" size={13} /> SEALED {vote.jurorId}</span><h3>{vote.vote.replace("_", " ")}</h3><p>{vote.reason}</p><small>{vote.keyEvidenceIds.join(" · ")} · {Math.round(vote.confidence * 100)}%</small></article>)}</div>}

      <div className="deliberation-grid">
        <section className="panel compare-panel">
          <div className="panel-heading"><div><span className="mini-label">TESTIMONY MATRIX</span><h3>Where the agents align—and conflict</h3></div></div>
          <div className="compare-group positive"><div className="compare-title"><span><Icon name="check" size={15} /></span><strong>Agreements</strong><small>{result.agreements.length}</small></div>{result.agreements.map((item) => <p key={item}>{item}</p>)}</div>
          <div className="compare-group conflict"><div className="compare-title"><span><Icon name="balance" size={15} /></span><strong>Material disagreements</strong><small>{result.disagreements.length}</small></div>{result.disagreements.map((item) => <p key={item}>{item}</p>)}</div>
          <div className="compare-group unsupported"><div className="compare-title"><span><Icon name="alert" size={15} /></span><strong>Unsupported claim</strong><small>{result.unsupportedClaims.length}</small></div>{result.unsupportedClaims.map((item) => <p key={item}>{item}</p>)}</div>
        </section>

        <section className="panel risk-panel">
          <div className="panel-heading"><div><span className="mini-label">MATERIAL RISKS</span><h3>Escalation triggers</h3></div><span className="risk-count">{result.riskFlags.length} open</span></div>
          <div className="risk-list">
            {result.riskFlags.map((risk) => <div className="risk-item" key={risk.id}><span className={`severity severity-${risk.severity}`}>{risk.severity}</span><div><strong>{risk.title}</strong><p>{risk.description}</p><small>{risk.type.toUpperCase()} · {risk.evidenceReferences.join(", ")}</small></div></div>)}
          </div>
        </section>
      </div>

      <div className="quality-strip">
        <div><span>Evidence quality</span><strong><i className="green-dot" /> {result.evidenceQuality[0].toUpperCase() + result.evidenceQuality.slice(1)}</strong></div>
        <div><span>Verified sources</span><strong>5 / 5</strong></div>
        <div><span>Claim coverage</span><strong>7 / 7</strong></div>
        <div><span>Decision rule</span><strong>Risk-triggered</strong></div>
        <AppButton onClick={next}>Send to human judge</AppButton>
      </div>
    </div>
  );
}

function HumanJudge({ onDecision, inspect, juryResult, counterfactual, court }: { onDecision: (decision: HumanDecision) => void; inspect: () => void; juryResult: JuryResult; counterfactual: CounterfactualResult; court: CourtProcessResult | null }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState(false);
  const escalationReasons = getEscalationReasons(juryResult, counterfactual);
  const finish = (action: HumanDecision["action"], defaultReason: string) => {
    if (action === "overridden" && reason.trim().length < 8) { setError(true); return; }
    const finalReason = action === "overridden" ? reason.trim() : defaultReason;
    onDecision(HumanDecisionSchema.parse({ action, reason: finalReason, decidedBy: "A. Korhonen · Senior Credit Officer", decidedAt: "2026-09-18T09:43:08+03:00" }));
  };
  return (
    <div className="screen-enter">
      <StageHeading eyebrow="Human judge" title="The final authority is human." body="Review the complete case file, then accept the original recommendation, override it, or request additional review. Your reason becomes part of the permanent audit record." aside={<div className="judge-identity"><div className="avatar large">AK</div><div><span>ASSIGNED JUDGE</span><strong>A. Korhonen</strong><small>Senior Credit Officer</small></div></div>} />

      <div className="judge-layout">
        <section className="panel bench-panel">
          <div className="bench-header"><div className="verdict-icon small"><Icon name="gavel" size={22} /></div><div><span className="mini-label">MATTER BEFORE THE JUDGE</span><h3>Original decline challenged by independent review</h3></div><button className="inspect-link" onClick={inspect}><Icon name="eye" size={16} /> Inspect evidence</button></div>
          <div className="decision-comparison">
            <div><span>ORIGINAL MODEL</span><strong className="decline-text">Decline</strong><small>86% confidence</small></div>
            <div className="versus"><Icon name="balance" size={22} /><span>REVIEWED</span></div>
            <div><span>JURYAI FINDING</span><strong className="review-text">{juryResult.recommendation === "human_review" ? "Human review" : juryResult.recommendation}</strong><small>{juryResult.riskFlags.length} material risk flags</small></div>
          </div>
          <div className="judge-brief">
            <div className="why-called"><span className="mini-label">HUMAN ESCALATION</span><h4>Why was I called?</h4></div>
            {court && <><div className="brief-row"><span className="brief-icon teal"><Icon name="users" size={15} /></span><p><strong>Jury verdict: {court.juryVerdict.split}</strong></p></div>{court.judgeAssessments.map((assessment) => <div className="brief-row" key={assessment.issueId}><span className="brief-icon amber"><Icon name="lock" size={15} /></span><p><strong>{assessment.assessment}</strong></p></div>)}</>}
            {escalationReasons.slice(0, 4).map((reason) => <div className="brief-row" key={reason.id}><span className={`brief-icon ${reason.tone}`}><Icon name={reason.id === "counterfactual" ? "fingerprint" : "alert"} size={15} /></span><p><strong>{reason.label}</strong></p></div>)}
          </div>
        </section>

        <section className="judgment-card">
          <div className="section-label">RECORD YOUR JUDGMENT</div>
          <h3>What should happen next?</h3>
          <p className="judgment-help">Independent issue assessments were sealed before the jury verdict was revealed. Accept it, override it, or request retrial/additional review.</p>
          <label className="reason-label" htmlFor="reason">Reason for override <span>Required for override</span></label>
          <textarea id="reason" value={reason} onChange={(e) => { setReason(e.target.value); setError(false); }} className={error ? "input-error" : ""} placeholder="e.g. Verified financial evidence supports affordability; exclude the unsupported payment-risk claim and location proxy…" />
          <div className="char-count"><span className={error ? "error-message" : ""}>{error ? "Enter at least 8 characters to create an auditable reason." : "This explanation will appear in the case report."}</span><span>{reason.length} / 400</span></div>
          <div className="judge-actions">
            <AppButton variant="primary" icon="check" onClick={() => finish("overridden", "")}>Override to approve</AppButton>
            <AppButton variant="secondary" icon="refresh" onClick={() => finish("review_requested", "Retrial and additional documentary review requested before final disposition.")}>Request retrial</AppButton>
            <AppButton variant="ghost" icon={null} onClick={() => finish("approved", `Jury verdict ${court?.juryVerdict.majority ?? "human review"} accepted after independent judicial assessment.`)}>Accept jury verdict</AppButton>
          </div>
          <div className="audit-notice"><Icon name="lock" size={14} /> Decision, identity, reason, and timestamp will be logged.</div>
        </section>
      </div>
    </div>
  );
}

function CaseReport({ decision, restart, findings, mode, court, counterfactual }: { decision: HumanDecision; restart: () => void; findings: AgentFinding[]; mode: "live" | "fallback"; court: CourtProcessResult | null; counterfactual: CounterfactualResult }) {
  const juryResult = useMemo(() => deliberate(findings), [findings]);
  const report = useMemo(() => generateReport(demoCase, findings, juryResult, decision, court ?? undefined), [decision, findings, juryResult, court]);
  const actionLabel = decision.action === "overridden" ? "Override approved" : decision.action === "approved" ? "Original decline approved" : "Further review requested";
  const outcome = decision.action === "overridden" ? "Application approved" : decision.action === "approved" ? "Application declined" : "Decision pending review";
  return (
    <div className="screen-enter">
      <StageHeading eyebrow="Case report" title="Decision recorded. Reason preserved." body="The case is closed with a readable account of the original decision, independent challenges, and final human judgment." aside={<div className="complete-stamp"><Icon name="check" size={17} /><div><span>CASE STATUS</span><strong>Review complete</strong></div></div>} />

      <article className="report-paper">
        <div className="report-head">
          <Brand />
          <div><span>CASE REPORT</span><strong>{report.reportId}</strong><small>Generated 18 Sep 2026 · 09:43 EEST</small></div>
        </div>
        <div className="report-title-row">
          <div><span className="mini-label">FINAL DISPOSITION</span><h2>{outcome}</h2><p>{demoCase.applicant.name} · €{demoCase.applicant.requestedAmountEur.toLocaleString("en-US")} consumer loan</p></div>
          <div className={`report-seal ${decision.action}`}><Icon name={decision.action === "overridden" ? "check" : decision.action === "approved" ? "x" : "refresh"} size={23} /><span>{actionLabel}</span></div>
        </div>

        <div className="report-summary"><span><Icon name="spark" size={17} /></span><div><strong>What JuryAI discovered</strong><p>{report.summary}</p></div></div>

        <div className="report-columns">
          <section><div className="report-section-title"><span>01</span><strong>Original recommendation</strong></div><div className="report-block"><div className="report-decision-line"><strong>DECLINE</strong><span>86% confidence</span></div><p>Recent payment instability and a local default-risk index were cited as key reasons.</p></div></section>
          <section><div className="report-section-title"><span>02</span><strong>Independent findings</strong></div><div className="finding-stack">{findings.map((finding, index) => <div key={finding.agentId}><i className={`finding-dot ${index === 1 ? "red" : index === 2 ? "amber" : "teal"}`}/><p><strong>{finding.displayName}</strong><span>{finding.recommendation}</span></p></div>)}</div></section>
        </div>

        <section className="report-risks"><div className="report-section-title"><span>03</span><strong>Material risks & evidence</strong></div><div className="report-risk-grid">{juryResult.riskFlags.map((risk) => <div key={risk.id}><span className={`severity severity-${risk.severity}`}>{risk.severity}</span><strong>{risk.title}</strong><p>{risk.description}</p><small>{risk.evidenceReferences.join(" · ")}</small></div>)}</div></section>

        {court && <section className="phase4-report"><div className="report-section-title"><span>04</span><strong>Compartmentalized court record</strong></div><div className="phase4-report-grid"><div><strong>Evidence ledger</strong><p>{court.ledger.entries.length} isolated findings; {court.ledger.deduplicatedCount} duplicates removed.</p></div><div><strong>Counterfactual</strong><p>{counterfactual.baselineRecommendation} → {counterfactual.counterfactualRecommendation}; sensitivity {counterfactual.changedOutcome ? "detected" : "not detected"}.</p></div><div><strong>CasePacket</strong><p>{court.casePacket.verifiedFindings.length} verified, {court.casePacket.disputedFindings.length} disputed, {court.casePacket.riskFlags.length} risk flags.</p></div><div><strong>Jury</strong><p>{court.juryVerdict.split}; {court.juryVerdict.safeguardTriggers.join(", ") || "no safeguard trigger"}.</p></div><div><strong>Independent judge review</strong><p>{court.judgeAssessments.map((item) => item.assessment).join(" ")}</p></div></div></section>}

        <section className="human-ruling">
          <div className="ruling-label"><Icon name="gavel" size={18} /> HUMAN RULING</div>
          <div><span>DECISION</span><strong>{actionLabel}</strong></div>
          <div className="ruling-reason"><span>RECORDED REASON</span><p>“{decision.reason}”</p></div>
          <div className="ruling-signature"><span>DECIDED BY</span><strong>A. Korhonen</strong><small>18 Sep 2026 · 09:43:08 EEST</small></div>
        </section>

        <section className="timeline-section"><div className="report-section-title"><span>05</span><strong>Audit timeline</strong></div><div className="timeline">{report.auditTimeline.map((event, index) => <div key={`${event.time}-${event.title}`} className={index === report.auditTimeline.length - 1 ? "final" : ""}><time>{event.time}</time><i /><p><strong>{event.title}</strong><span>{event.description}</span></p></div>)}</div></section>

        <div className="report-foot"><span><Icon name="fingerprint" size={14} /> Audit ref: {demoCase.id}-BT01-HJ</span><span>{mode === "live" ? "Live isolated agent testimony" : "Deterministic fallback record"}</span></div>
      </article>

      <div className="report-actions"><AppButton variant="secondary" icon="refresh" onClick={restart}>Run demo again</AppButton><button className="button button-primary" onClick={() => window.print()}>Print case report <Icon name="download" size={17} /></button></div>
    </div>
  );
}

function EvidenceDrawer({ close }: { close: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="evidence-drawer" role="dialog" aria-modal="true" aria-label="Evidence file">
        <div className="drawer-head"><div><span className="mini-label">SEALED CASE FILE</span><h2>Evidence inspection</h2><p>Source-level context available to the human judge.</p></div><button onClick={close} aria-label="Close evidence"><Icon name="x" /></button></div>
        <div className="drawer-alert"><Icon name="shield" size={17} /><p><strong>5 of 5 sources verified</strong><span>No evidence was excluded from this review.</span></p></div>
        <div className="drawer-list">{demoCase.evidence.map((evidence) => <div className="drawer-source" key={evidence.id}><EvidenceRow evidence={evidence} compact/><p>{evidence.summary}</p><div>{evidence.dataPoints.map((point) => <span key={point}>{point}</span>)}</div></div>)}</div>
        <div className="drawer-foot"><AppButton onClick={close} icon="check">Done inspecting</AppButton></div>
      </section>
    </div>
  );
}

export function JuryDemo() {
  const [stage, setStage] = useState(0);
  const [decision, setDecision] = useState<HumanDecision | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [findings, setFindings] = useState<AgentFinding[]>(mockFindings);
  const [agentMode, setAgentMode] = useState<"live" | "fallback">("fallback");
  const [counterfactual, setCounterfactual] = useState<CounterfactualResult>(() => runDemoPostalCounterfactual(demoCase));
  const [court, setCourt] = useState<CourtProcessResult | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  useEffect(() => { window.scrollTo({ top: 0, behavior: "smooth" }); }, [stage]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") setDrawerOpen(false); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);
  const next = () => setStage((value) => Math.min(value + 1, 5));
  const runTrial = async () => {
    setAgentsLoading(true);
    try {
      const response = await fetch("/api/agents", { method: "POST" });
      if (!response.ok) throw new Error("Agent review unavailable");
      const result = AgentReviewResultSchema.parse(await response.json());
      setFindings(result.findings);
      setAgentMode(result.mode);
      setCounterfactual(result.counterfactual);
      setCourt(result.court);
    } catch {
      setFindings(mockFindings);
      setAgentMode("fallback");
      setCounterfactual(runDemoPostalCounterfactual(demoCase));
      setCourt(null);
    } finally {
      setAgentsLoading(false);
      setStage(2);
    }
  };
  const finish = (humanDecision: HumanDecision) => { setDecision(humanDecision); setStage(5); };
  const restart = () => { setDecision(null); setFindings(mockFindings); setAgentMode("fallback"); setCounterfactual(runDemoPostalCounterfactual(demoCase)); setCourt(null); setStage(0); };
  const juryResult = useMemo(() => deliberate(findings), [findings]);

  return (
    <main className="app-shell">
      <ProgressRail current={stage} />
      <div className="workspace">
        <Topbar stage={stage} />
        <div className="mobile-progress"><span style={{ width: `${((stage + 1) / 6) * 100}%` }} /></div>
        <div className="content-wrap">
          {stage === 0 && <CaseIntake next={next} />}
          {stage === 1 && <InitialDecision next={runTrial} loading={agentsLoading} />}
          {stage === 2 && <BlindCourt next={next} findings={findings} mode={agentMode} counterfactual={counterfactual} court={court} />}
          {stage === 3 && <JuryDeliberation next={next} findings={findings} court={court} />}
          {stage === 4 && <HumanJudge onDecision={finish} inspect={() => setDrawerOpen(true)} juryResult={juryResult} counterfactual={counterfactual} court={court} />}
          {stage === 5 && decision && <CaseReport decision={decision} restart={restart} findings={findings} mode={agentMode} court={court} counterfactual={counterfactual} />}
        </div>
        <footer className="app-footer"><span>JuryAI · AaltoAI Hackathon 2026</span><span>Phase 4 · Sequential compartmentalization · Human authority</span></footer>
      </div>
      {drawerOpen && <EvidenceDrawer close={() => setDrawerOpen(false)} />}
    </main>
  );
}
