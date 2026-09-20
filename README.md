# JuryAI: Procedural Fairness for Enterprise AI (Hackathon Demo)

*This repository contains the interactive frontend prototype of JuryAI, built for the AaltoAI Data Sovereignty & Responsible AI Hackathon (IBM AI Governance Track).*

## The Vision: What JuryAI Is

JuryAI is an AI governance escalation engine designed to put high-stakes automated decisions "on trial." Standard monolithic models act as judge, jury, and witness—creating single points of failure where hidden biases compound and compliance is impossible to audit. We replace this black-box faith with a verifiable, compartmentalized process.

The production architecture enforces procedural fairness through strict compartmentalization:

* **Local Anonymizing Gate:** An on-premise firewall that strips PII before data reaches a reasoning model, ensuring data sovereignty.

* **Context-Capped Witness Agents:** Specialized AI agents in isolated sessions receive mathematically capped token payloads, preventing context bloat.

* **Adversarial Synthesis:** An oversight engine that cross-examines agent outputs through counterfactual logic to detect contradictions and flag systemic bias.

* **Human Finality & Auditability:** The system surfaces a clean brief to a human decision-maker, generating a cryptographic routing footprint for compliance.

## This Repository: The Hackathon MVP

To guarantee zero latency and absolute stability during our live 5-minute pitch, this repository serves as a deterministic, interactive visualization of the JuryAI dashboard and routing pipeline. 

**MVP Tech Stack:**

* Next.js / React Web Application

* Tailwind CSS for styling and responsive layouts

* Deterministic state machine simulating the multi-agent routing pipeline and adversarial synthesis payload.
