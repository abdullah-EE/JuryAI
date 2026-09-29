# JuryAI

> **AI should not be judge, jury, and witness.**

**2nd Place — AaltoAI Data Sovereignty & Responsible AI Hackathon 2026**

JuryAI is a decision-assurance prototype for high-stakes AI. It explores a simple idea: an AI system should not be trusted to make an important decision, explain that decision, and effectively validate its own reasoning without independent checks.

Instead, JuryAI applies a courtroom-inspired review process built around separation of roles, evidence boundaries, preserved disagreement, and human final authority.

## How it works

~~~text
Original AI decision
        ↓
Identity + context filtering
        ↓
Compartmentalized specialist review
        ↓
Adversarial checks + counterfactual testing
        ↓
Deterministic Clerk assembles the case
        ↓
Independent AI jury review
        ↓
Human makes the final decision
~~~

Each specialist is designed to receive only the evidence required for its role. Findings are structured and tied back to evidence references. Conflicting findings are preserved rather than averaged away, then assembled into a case that a human reviewer can inspect and question.

For the hackathon demo, JuryAI was applied to an **AI-assisted lending decision**.

> 📐 **Want the full technical picture?** See **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**
> for a code-grounded, function-by-function walkthrough of the multi-agent system:
> the trial pipeline and event stream, the Identity Firewall, agent
> compartmentalization (manifests, input packets, sufficiency gate), the
> deterministic counterfactual/adversarial engine, the jury and safeguards, live vs.
> fallback modes, and the audit footprint — including a full pipeline diagram.

## The multi-agent pipeline at a glance

JuryAI runs a **stateless, event-driven trial**. One review is one request that
streams a sequence of typed events (the audit trail) and ends in a mandatory human
handoff. Each stage is a small, isolated agent with a narrow mandate:

| # | Stage | What it does | Key file |
|---|-------|--------------|----------|
| 1 | **Identity Firewall** | Strips direct identifiers (name, id) → pseudonymous `SUBJECT-…` token before any model sees the case | `lib/identity-firewall.ts` |
| 2 | **Evidence partitioning** | Statically routes evidence to the agent(s) permitted to see it | `lib/trial-events.ts` |
| 3 | **Sufficiency gate** | "Enough, and not too much" — an agent with an incomplete/over-broad packet abstains | `lib/agents/sufficiency.ts` |
| 4 | **Witness agents ×3** | Decision Witness, Fact Checker, Bias & Privacy Challenger — each in an isolated, context-capped session that never sees other agents' findings | `lib/agents/service.ts`, `lib/agents/manifests.ts` |
| 5 | **Counterfactual engine** | Deterministic bias/sensitivity test (e.g. re-scores the decision with postal geography removed) | `lib/counterfactual.ts` |
| 6 | **Court Clerk** | Deterministically de-dups and assembles findings into a neutral case packet — adds no opinion | `lib/court/clerk.ts` |
| 7 | **Judge ∥ Jury** | Judge frames the legal issues while 3 jurors vote from different neutral views of the *same* facts; verdict sealed until both finish | `lib/court/service.ts`, `lib/court/jury.ts`, `lib/court/juror-views.ts` |
| 8 | **Safeguards** | Any serious risk (counterfactual flip, unsupported claim, disputed evidence…) forces human review even with a clean majority | `lib/court/jury.ts` |
| 9 | **Human authority** | Pipeline **stops** at `awaiting_human` — there is no automated final decision | `components/jury-demo-v2.tsx` |

### The Firewall

The Identity Firewall is JuryAI's data-minimization gate. It derives a pseudonymous
subject token, then redacts the applicant's name and id (and their literal
occurrences) from every evidence field and every line of the decision rationale,
producing a `safeCase` that every downstream agent operates on. It records a strict
audit object listing exactly which fields were redacted vs. retained.

It intentionally **retains** the purpose-limited sensitivity field (e.g. postal
code) so the bias challenger can test it under controlled counterfactual conditions —
identity is removed, but the signal to be *audited for bias* is deliberately kept.
Full detail (including its honest limits) is in
[`ARCHITECTURE.md`](./ARCHITECTURE.md#3-the-identity-firewall).

## Technical highlights

- Role-specific context contracts and evidence permissions
- Structured agent inputs and outputs validated with **Zod**
- Isolated review stages that avoid passing previous agents' conclusions forward
- Deterministic evidence validation and case assembly
- Counterfactual sensitivity checks
- Independent jury views and sealed votes
- Human-review interface with evidence-grounded case Q&A
- Typed event-driven demo workflow with tests, linting, and type checking

## Stack

- **Next.js 16**
- **React 19**
- **TypeScript**
- **Zod**
- **Tailwind CSS**

## Prototype scope

This repository is the hackathon MVP and interactive demonstration of the JuryAI architecture. The live demo uses a deterministic/local workflow so the review process can be demonstrated reliably without depending on external model latency.

It is **not** a deployed lending system, legal/compliance certification, or claim of bias-free AI.

## Run locally

~~~bash
npm install
npm run dev
~~~

Quality checks:

~~~bash
npm run typecheck
npm run lint
npm test
npm run build
~~~

## Why I built it

The project combines my interest in AI systems with a question that matters more as AI moves into consequential decisions: **how do we review the decision itself, not just monitor the model that produced it?**

JuryAI was built for the IBM AI Governance track at the AaltoAI Data Sovereignty & Responsible AI Hackathon.
