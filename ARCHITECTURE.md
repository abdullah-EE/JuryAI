# JuryAI — Multi-Agent System (M.A.S) Architecture

> A detailed, code-grounded walkthrough of how JuryAI actually works: the full
> multi-agent "trial" pipeline, the Identity Firewall, agent compartmentalization,
> the counterfactual/adversarial engine, the jury, and the audit footprint.

This document describes **what is implemented in this repository**, function by
function. Where the code simulates something that would be real infrastructure in
production (e.g. processing zones), it is called out explicitly. The public-facing
overview lives in [`README.md`](./README.md); this file is the deep dive.

---

## 1. The archetype: a courtroom, not a chatbot

Most AI decision systems are **monolithic**: one model makes a decision, explains
it, and effectively validates its own reasoning. That model is judge, jury, and
witness at once — a single point of failure where bias compounds silently and the
"explanation" is just more output from the same black box.

JuryAI rejects that. It models a **courtroom process** where responsibilities are
split across many small, isolated agents, each with a narrow mandate and strictly
limited access to information. No single agent sees the whole picture; disagreement
is preserved rather than averaged away; and a **human always makes the final call**.

The whole system is a **stateless, event-driven pipeline**. There is no database.
One trial = one HTTP request that streams a sequence of typed events (the audit
trail) and returns a final `DemoRunResult`.

---

## 2. End-to-end pipeline (the trial)

```
                          app/api/trials/run/route.ts
                                    │  (POST, streams NDJSON)
                                    ▼
                   lib/trial-events.ts :: executeTrialStream()
                                    │  emits TrialEvent[] over a callback
   ┌────────────────────────────────┴─────────────────────────────────────┐
   │                          THE TRIAL PIPELINE                            │
   └────────────────────────────────────────────────────────────────────────┘

  ①  trial_started
       │
       ▼
  ②  IDENTITY FIREWALL ............ applyIdentityFirewall(caseData)
       │                            → identity_firewall_completed
       ▼
  ③  EVIDENCE PARTITIONING ........ static role → evidence map
       │                            → evidence_partitioned
       ▼
  ④  AGENT REVIEW  (lib/agents/service.ts :: runAgentReview)
       │
       │   for each WITNESS role (decision_witness, fact_checker, bias_privacy_challenger):
       │        ├─ SUFFICIENCY GATE ...... sufficiency_gate_checked
       │        ├─ build INPUT PACKET .... (manifest-scoped, re-validated)
       │        ├─ RUN AGENT ............. witness_started → witness_completed
       │        │      (live OpenAI call in isolated session, or deterministic mock)
       │        └─ SEAL FINDING .......... finding_sealed
       │
       │   COUNTERFACTUAL ENGINE ......... runScenarioCounterfactual()
       │        └─ counterfactual_completed
       │
       ▼
  ⑤  COURT PROCESS  (lib/court/service.ts :: runCourtProcess)
       │
       │   ├─ EVIDENCE MICRO-SESSIONS .... evidence_analysis_started / _completed  (per evidence)
       │   ├─ COURT CLERK ................ clerk_started → case_packet_created
       │   │       (deterministic: dedups findings, aggregates risks, NO opinion)
       │   │
       │   ├─────────── run concurrently (Promise.all) ───────────┐
       │   │  JUDGE issues                    JURY votes           │
       │   │  judge_assessment_ready   juror_started → juror_vote_sealed (J1,J2,J3)
       │   └──────────────────────────────────────────────────────┘
       │        (verdict is not exposed until BOTH are sealed)
       │
       ▼
  ⑥  jury_complete → jury_revealed
       │
       ▼
  ⑦  SAFEGUARDS ................... safeguard_triggered (0..n)
       │
       ▼
  ⑧  human_review_required ........ pipeline STOPS here — no auto-decision
       │
       ▼
  ⑨  generateComplianceSummary() → audit_ready (carries full DemoRunResult)
       │
       ▼
  ⑩  trial_completed
```

### Execution order, precisely

`executeTrialStream` (in `lib/trial-events.ts`) drives the fixed sequence. Each call
to `emit()` stamps the event with an incrementing `sequence` number and an ISO
`timestamp`, validates it against `TrialEventSchema`, sends it to the client, and —
in paced/demo mode — waits ~380 ms so the front-end can animate each stage.

The true, flattened order of emitted event types is:

```
trial_started
identity_firewall_completed
evidence_partitioned
  sufficiency_gate_checked      ┐
  witness_started               │  repeated per witness role
  witness_completed             │  (decision_witness, fact_checker,
  finding_sealed                ┘   bias_privacy_challenger)
counterfactual_completed
  evidence_analysis_started     ┐  repeated per evidence item
  evidence_analysis_completed   ┘
clerk_started
case_packet_created
  judge_assessment_ready        ┐  judge issues ∥ juror votes (concurrent)
  juror_started                 │
  juror_vote_sealed             ┘  jurors J1 / J2 / J3
jury_complete
jury_revealed
safeguard_triggered             (0..n)
human_review_required
audit_ready
trial_completed
```

If **anything** throws, the API route's catch block emits a single synthetic
`trial_completed` with status `fallback_failed_safely` and `mode: "fallback"`, so
the stream always closes cleanly and safely.

---

## 3. The Identity Firewall

**File:** `lib/identity-firewall.ts` · **Function:** `applyIdentityFirewall(rawCase)`

The firewall is the first substantive stage. It sits between the raw case and every
reasoning agent, and its job is **data minimization**: strip direct identifiers
before any model ever sees the case.

What it does:

1. **Derives a pseudonymous subject token** — `SUBJECT-<last id segment>` — so the
   subject can still be referenced consistently without their real identity.
2. **Collects direct identifiers** — the applicant's `name` and `id`.
3. **Redacts by literal substitution** — a `redact()` helper `replaceAll`s those
   exact strings with `[REDACTED]` across **every** free-text field: each evidence
   item's `title`, `provider`, `summary`, and `dataPoints`, plus every line of the
   `initialDecision.rationale`.
4. **Rebuilds a `safeCase`** where `applicant.id → subjectToken` and
   `applicant.name → "[REDACTED]"`, re-parsed through `CaseSchema` to guarantee the
   output is still a valid case.
5. **Emits an audit record** (`IdentityFirewallAudit`, a `.strict()` Zod object):

   ```ts
   {
     caseId,
     subjectToken,
     redactedFields: ["applicant.name", "applicant.id", "embedded direct identifiers"],
     retainedFields: ["verified evidence", "decision metadata", "purpose-limited sensitivity field"],
     directIdentifiersRemoved: true,   // z.literal(true) — cannot be false
   }
   ```

### Important honesty notes about the firewall

- It strips **name and id only** (and their literal occurrences). Fields like
  `applicant.age`, `occupation`, and `postalCode` are **deliberately retained** —
  the postal code is required downstream by the bias/privacy challenger to run the
  counterfactual. This is a design choice, not an oversight: the firewall removes
  *identity*, not *all* potentially-sensitive signal, and the retained sensitivity
  field is then tested for bias under controlled conditions.
- Redaction is **literal substring replacement**, so it deliberately does not
  attempt to catch paraphrased or inferred identifiers. It is a demonstrative,
  deterministic gate — not a production PII scrubber.
- It is applied **twice, idempotently**: once in `executeTrialStream` and again
  defensively at the top of `runAgentReview`. Applying it to an already-safe case
  is a no-op, which is the point — defense in depth.

In production framing this is the **"Local Anonymizing Gate"**: an on-premise step
that ensures raw identity never leaves the environment. In this repo it runs
in-process as a pure function.

---

## 4. Compartmentalization — how agents are kept isolated

This is the heart of the archetype. Three mechanisms enforce least-privilege so no
agent can see more than its mandate allows.

### 4a. Manifests — the context contract

**File:** `lib/agents/manifests.ts` (`agentDefinitions`) · schema
`AgentInputManifestSchema` in `lib/schemas.ts`.

Every witness role carries a manifest that declares exactly what it may see:

| Role | Agent ID | Allowed evidence | Data categories | Sensitive fields | Gets decision rationale? | Gets other agents' findings? |
|------|----------|------------------|-----------------|------------------|--------------------------|------------------------------|
| **Decision Witness** | `AG-DECISION-01` | EV-01, EV-02, EV-03 | income, credit, banking | none | No | **No** |
| **Fact Checker** | `AG-FACT-01` | EV-02, EV-03, EV-04 | credit, banking, context | none | Yes (the claims to verify) | **No** |
| **Bias & Privacy Challenger** | `AG-BIAS-01` | EV-05 only | applicant | `postalCode` | Yes | **No** |

All three manifests set `receivesOtherAgentFindings: z.literal(false)` and prohibit
`other_agent_findings`, `jury_conclusions`, `raw_chain_of_thought`, and
`full_applicant_record`. The `z.literal(false)` means "no cross-contamination"
is enforced at the type/schema level, not just by convention.

### 4b. Input packets — enforcing the contract at runtime

**File:** `lib/agents/input-packets.ts` · `createAgentInputPacket(role, caseData, counterfactual)`

For each agent, a discriminated-union **input packet** is assembled containing
*only* the evidence its manifest allows. The helper `evidenceFor()` **throws** if a
requested evidence item is missing or if its category isn't on the manifest's
allow-list. A separate `assertPacketWithinManifest()` re-validates that the packet's
role matches and every evidence id/category is within bounds — and it is called
**twice**: once when the packet is built, and again inside `executeLiveAgent` right
before the model call.

The result: even if agent code were buggy, an out-of-scope packet cannot reach a
model without throwing first.

### 4c. Sufficiency gate — "enough, and not too much"

**File:** `lib/agents/sufficiency.ts` · `assessAgentSufficiency`

Before an agent runs, the sufficiency gate checks that all `allowedEvidenceIds`
actually exist in the case. Role-specific extras: the fact checker also needs a
non-empty decision rationale; the bias challenger needs a counterfactual result.
It returns `{ sufficient, tooMuchContext, missingItems, permittedEvidenceIds }`.

If a role is **insufficient**, it does **not** call the model — it abstains via
`insufficientFinding` (confidence 0, a disputed claim). This is the "admissibility"
check: an agent that can't be given a fair, complete-enough packet doesn't testify.

### 4d. Schema-level enforcement + stateless sessions

`AgentFindingSchema` has a `.refine()` guaranteeing that a finding's
`evidenceReferences` is always a subset of its manifest's `allowedEvidenceIds` —
enforced at parse time. Each live agent runs in its **own stateless OpenAI call**
with `store: false`, so there is no shared memory or server-side conversation state
across agents.

`tests/compartmentalization.test.ts` verifies all of this: distinct purposes,
distinct evidence sets, `receivesOtherAgentFindings === false`, the bias challenger
having EV-05 + `postalCode` but **not** EV-01/02/03 / name / age, and findings
carrying their manifests intact end-to-end.

In production framing these are the **"Context-Capped Witness Agents"**: sequestered
sessions with mathematically bounded inputs. In demo mode, `DEMO_MODE=true` further
clamps timeouts (≤5000 ms) and output tokens (≤350) per call.

---

## 5. The counterfactual / adversarial engine

**File:** `lib/counterfactual.ts`

This is the bias-detection core, and it is **fully deterministic** — a scoring
function, not an LLM guess.

- `evaluateDemoDecision(input)` computes a risk score:
  `+2` if credit score < 680, `+2` if DTI > 0.36, `+1` if amount/income > 6,
  `+1` if delayed transfers > 1, `−1` if migration is documented, and — crucially —
  **`+3` if `postalGeography` is present**. Score ≥ 2 ⇒ `decline`, else `approve`.
  That `+3` postal weight is exactly what makes location act as a hidden proxy.

- `comparePostalCounterfactual(baseline, cf)` runs the scorer **twice** — once with
  the postal geography present, once with it nulled out — and reports whether the
  outcome `changedOutcome`, with `severity: high` if it flipped. Its `summary`
  states plainly that a flip *"warrants human review; it does not prove
  discrimination."*

- `runScenarioCounterfactual` dispatches by case type: lending tests postal
  geography, HR tests a `careerBreak` field, benefits/gov tests a `districtCode`.
  All return the shared `CounterfactualResult` shape.

### The grounding guardrail

**File:** `lib/agents/service.ts` · `groundedBiasOutput`

Because the bias agent is the one most likely to over-claim, its free-text output is
post-processed adversarially: any claim/risk matching a `prohibitedBiasClaimPattern`
(e.g. "bias is proven", "the decision is unbiased") is **stripped**; the
authoritative deterministic `counterfactual.summary` is injected as the observed
claim; the recommendation is forced to "Require human review for counterfactual
sensitivity" when the outcome changed; and residual high/critical bias risks are
downgraded to medium. The LLM can flag sensitivity, but it cannot declare
discrimination proven or disproven — only the deterministic test speaks to that.

This is the **"Adversarial Synthesis"**: cross-examining agent output against a
neutral, deterministic check.

---

## 6. The Court: clerk, judge, and jury

**File:** `lib/court/service.ts` · `runCourtProcess`

### 6a. Evidence micro-sessions
Each evidence item is examined in its own session, emitting
`evidence_analysis_started` / `_completed` and producing `EvidenceMicroFinding`s.

### 6b. The Court Clerk (deterministic assembly)
**File:** `lib/court/clerk.ts`

- `createEvidenceLedger(findings)` de-duplicates micro-findings by a composite key,
  sets `provenancePreserved: true`, and records `deduplicatedCount`.
- `buildCasePacket(...)` assembles verified vs. disputed findings, collects
  `evidenceReferences`, and **aggregates risk flags** from four sources: witness
  risks, ledger risk types, the counterfactual bias flag (if the outcome changed),
  and any **unsupported material claims** (which become explicit `contradictions`).
  It computes an average `confidence` and dedups the flags.

Critically, the clerk **adds no opinion** — it organizes sealed findings into a
neutral `CasePacket`. Raw chain-of-thought never enters it.

### 6c. Judge issues ∥ Jury votes (concurrent, but sealed)
The judge produces up to three issue assessments (`JI-FACT`, `JI-CF`, `JI-PRIV`,
`JI-EVID`) while the jury votes — both via `Promise.all`. The procedure flag
`judgeAssessmentsSealedBeforeVerdictExposure: true` ensures the verdict is not
revealed until both are complete.

### 6d. The jury
**Files:** `lib/court/juror-views.ts`, `lib/court/jury.ts`

`buildAllJurorViews(packet)` builds **three different neutral projections of the
same `CasePacket`** so jurors reason from different angles but identical facts:

| Juror | View | Sees the case through… |
|-------|------|------------------------|
| J1 | `evidence_first` | verified/disputed evidence + risks |
| J2 | `claim_evidence` | claims mapped to their evidence + associated risks |
| J3 | `contradiction_first` | contradictions + disputed vs. supporting evidence |

Each view embeds a `ViewAudit` with a **`materialSignature`** — a stable canonical
hash (`casePacketMaterialSignature`) proving all three jurors saw the *same*
underlying material. Jurors vote in independent sessions ("You cannot see other
jurors… Do not infer omitted facts"), returning `{ vote, confidence,
keyEvidenceIds, reason }`. A live vote citing evidence outside the packet is
rejected and falls back.

`calculateJuryVerdict(votes, packet)` tallies `uphold` / `overturn` /
`human_review`, and the majority is the **first option reaching count ≥ 2** —
otherwise it defaults to `human_review`. It reports the `split`, whether there was
`disagreement`, the `safeguardTriggers`, and `judicialReviewRequired`.

---

## 7. Safeguards — when the system forces human review

**Function:** `safeguardTriggers(packet)` (in `lib/court/jury.ts`)

A verdict is never the whole story. A safeguard fires — forcing human review **even
if there is a clean 2–1 majority** — on any of:

- counterfactual `changedOutcome` (sensitivity to a protected/proxy field),
- a high/critical **factual** risk,
- a high/critical **bias/privacy** risk,
- high/critical **evidence** risk, or any disputed findings,
- a high/critical **procedural** risk.

This is the escalation core: a single serious flag routes the case to a human. The
pipeline's terminal state is **always `awaiting_human`** — there is no path to an
automated final decision.

---

## 8. Live vs. fallback (deterministic) mode

Both `runAgentReview` and `runCourtProcess` decide their execution mode the same way:

```
apiKey   = options.apiKey   ?? process.env.OPENAI_API_KEY
useMocks = options.useMocks ?? (process.env.USE_MOCK_AGENTS === "true")
demoMode = process.env.DEMO_MODE === "true"

runner = (!useMocks && apiKey) ? new OpenAI…Runner(apiKey) : null   // null ⇒ mocks
```

- **Live:** runners POST to `https://api.openai.com/v1/responses` with
  `store: false`, a strict `json_schema` output contract (`z.toJSONSchema(...)`),
  and an `AbortController` timeout. Invalid/missing output throws
  `InvalidAgentOutputError`.
- **Graceful per-unit fallback:** every live call is wrapped in try/catch. On any
  failure it substitutes a deterministic mock (`mockFor` from `lib/mock-agents.ts`,
  or `fallbackEvidence` / `fallbackJudge` / `fallbackVotes`). Witnesses additionally
  get one correction retry (`maximumAttempts = 2` when not in demo mode).
- **Mode reporting:** if *any* single unit fell back, the aggregate `mode` is
  `"fallback"`, otherwise `"live"`. This is surfaced in the UI and the compliance
  summary.

Shipped defaults (`.env.example`) run the system **fully deterministic**:

```
USE_MOCK_AGENTS=false     # try live first, fall back on failure
DEMO_MODE=true            # clamp timeouts/tokens
OPENAI_API_KEY=           # empty ⇒ no runner ⇒ deterministic mocks
OPENAI_MODEL=gpt-4o-mini
AGENT_TIMEOUT_MS=5000
```

With no key set, every stage uses its deterministic path — which is why the live
5-minute demo has zero latency and zero external dependency, while the same code
runs real isolated agents the moment a key is provided.

---

## 9. The audit footprint

There is no database; the **audit trail is the event stream plus the returned
result object**.

- **Event trail** — `lib/trial-event-schema.ts` defines 21 `TrialEventType`s and a
  strict `TrialEventSchema` (sequence, timestamp, role, evidenceIds, status,
  summary, risk, confidence, mode, details, result). The NDJSON stream is the
  primary real-time record of every stage.
- **Case packet + ledger** — provenance-preserving, de-duplicated evidence with
  aggregated risk flags (`lib/court/clerk.ts`).
- **Compliance summary** — `lib/compliance.ts :: generateComplianceSummary` emits a
  strict `ComplianceSummarySchema`: `data_used` / `data_not_used`,
  `sensitive_fields_seen` / `_blocked`, `human_review_required`,
  `evidence_traceability`, `retention_mode: "Stateless isolated sessions"`,
  `storage_mode: "Provider response storage disabled"`, `processing_zone`,
  `raw_data_leaves_environment: false`, `derived_summaries_only: true`,
  `fairness_checks_run`, and `residual_risks` (the safeguard triggers).
- **Explainability** — `lib/explainability.ts` powers the post-trial Q&A:
  `classifyExplanationQuestion` ranks a question into one of ~8 intents, and
  `answerFromTrialRecord(question, scenario, run, events)` answers **only** from the
  emitted events and result (e.g. it reads the `identity_firewall_completed` event's
  `redactedFields` to answer "what data was hidden?"). Answers are grounded in the
  record, never in hidden reasoning.

> **Note on "processing zones" and "cryptographic footprint":** processing zones are
> policy labels in this prototype ("infrastructure routing is simulated"), and the
> audit footprint is the structured, schema-validated event ledger — not a
> cryptographic signing scheme. These are the honest boundaries of the MVP versus the
> production vision.

---

## 10. Data contracts (schemas)

`lib/schemas.ts` is the type backbone, all enforced with **Zod** at runtime:

- `CaseSchema` — applicant + 5 evidence items (EV-01…EV-05) + initial decision.
- `AgentInputManifestSchema` — the per-role context contract.
- `AgentFindingSchema` — structured finding with the evidence-subset `.refine()`.
- `AgentReviewResultSchema` — exactly 3 findings + counterfactual + court result.
- `EvidenceMicroFindingSchema`, `EvidenceLedgerSchema`, `CasePacketSchema`.
- `JurorVoteSchema`, `JuryVerdictSchema`, `JudgeIssueAssessmentSchema`,
  `CourtProcessResultSchema`.
- `lib/trial-event-schema.ts` — the event enum + strict event schema.
- `lib/scenarios.ts` — three scenarios (`lending`, `hr_screening`, `benefits`), each
  a full `Case` with display metadata; `getScenario` defaults to `lending`.

---

## 11. Roles & IDs cheat-sheet

- **Witnesses:** Decision Witness (`AG-DECISION-01`), Fact Checker (`AG-FACT-01`),
  Bias & Privacy Challenger (`AG-BIAS-01`).
- **Court:** evidence examiner (micro-sessions), judge issues (`JI-FACT`, `JI-CF`,
  `JI-PRIV`, `JI-EVID`; max 3), jurors J1/J2/J3.
- **Votes:** `uphold` / `overturn` / `human_review`; majority needs count ≥ 2, else
  `human_review`.
- **Terminal state:** always `awaiting_human` — mandatory human authority.

---

## 12. Where to look in the code

| Concern | File(s) |
|---------|---------|
| Trial orchestration / event sequence | `lib/trial-events.ts` |
| API entry point (NDJSON stream) | `app/api/trials/run/route.ts` |
| Identity firewall | `lib/identity-firewall.ts` |
| Manifests / compartmentalization | `lib/agents/manifests.ts`, `lib/agents/input-packets.ts`, `lib/agents/sufficiency.ts` |
| Witness layer (live/fallback, grounding) | `lib/agents/service.ts`, `lib/agents/runner.ts`, `lib/agents/openai-runner.ts` |
| Counterfactual engine | `lib/counterfactual.ts` |
| Court (clerk, judge, jury) | `lib/court/service.ts`, `lib/court/clerk.ts`, `lib/court/jury.ts`, `lib/court/juror-views.ts` |
| Compliance / audit | `lib/compliance.ts`, `lib/trial-event-schema.ts`, `lib/explainability.ts` |
| Data contracts | `lib/schemas.ts`, `lib/scenarios.ts` |
| Front-end (visualization) | `components/jury-demo-v2.tsx`, `app/globals.css` |
| Tests | `tests/compartmentalization.test.ts`, `tests/phase4-court.test.ts`, `tests/explainability.test.ts`, … |
```
