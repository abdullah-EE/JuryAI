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
