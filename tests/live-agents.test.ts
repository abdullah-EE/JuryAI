import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { demoCase } from "../lib/demo-case";
import { mockFindings } from "../lib/mock-agents";
import { createAgentInputPacket, assertPacketWithinManifest, type AgentInputPacket } from "../lib/agents/input-packets";
import { AgentModelOutputSchema } from "../lib/agents/output-schema";
import { runAgentReview } from "../lib/agents/service";
import { InvalidAgentOutputError, type AgentRunRequest, type AgentRunner } from "../lib/agents/runner";

class CapturingRunner implements AgentRunner {
  readonly packets: AgentInputPacket[] = [];

  async run<TOutput>(request: AgentRunRequest<TOutput>): Promise<TOutput> {
    this.packets.push(request.inputPacket);
    return request.outputSchema.parse({
      recommendation: "Approve",
      confidence: 0.8,
      claims: [{ statement: "Supplied evidence supports the scoped conclusion.", status: "supported" }],
      evidenceReferences: request.inputPacket.evidence.map((item) => item.id),
      risks: [],
      dataUsed: request.inputPacket.evidence.flatMap((item) => item.dataPoints),
    });
  }
}

describe("live isolated agent execution", () => {
  it("rejects evidence outside an agent's manifest", () => {
    const valid = createAgentInputPacket("decision_witness", demoCase);
    const tampered = structuredClone(valid);
    tampered.evidence[2] = {
      id: "EV-05",
      category: "applicant",
      summary: "Applicant profile",
      reliability: "medium",
      dataPoints: ["Postal code"],
    };
    assert.throws(() => assertPacketWithinManifest("decision_witness", tampered), /outside the decision_witness manifest/);
  });

  it("gives each invocation an independent input object and context", async () => {
    const runner = new CapturingRunner();
    const result = await runAgentReview({ runner, useMocks: false, apiKey: "test-key" });
    assert.equal(result.mode, "live");
    assert.equal(runner.packets.length, 3);
    assert.notEqual(runner.packets[0], runner.packets[1]);
    assert.notEqual(runner.packets[1], runner.packets[2]);
    const original = runner.packets[1].evidence[0].summary;
    runner.packets[0].evidence[0].summary = "mutated";
    assert.equal(runner.packets[1].evidence[0].summary, original);
  });

  it("rejects invalid model output with Zod", () => {
    const result = AgentModelOutputSchema.safeParse({ recommendation: "Approve", confidence: 4 });
    assert.equal(result.success, false);
  });

  it("retries invalid structured output exactly once", async () => {
    const attempts = new Map<string, number>();
    const runner = new CapturingRunner();
    const retryingRunner: AgentRunner = {
      async run<TOutput>(request: AgentRunRequest<TOutput>): Promise<TOutput> {
        const count = (attempts.get(request.role) ?? 0) + 1;
        attempts.set(request.role, count);
        if (count === 1) throw new InvalidAgentOutputError();
        return runner.run(request);
      },
    };
    const result = await runAgentReview({ runner: retryingRunner, useMocks: false, apiKey: "test-key" });
    assert.equal(result.mode, "live");
    assert.deepEqual([...attempts.values()], [2, 2, 2]);
  });

  it("falls back to deterministic mocks when live calls fail", async () => {
    const failingRunner: AgentRunner = {
      async run<TOutput>(): Promise<TOutput> {
        throw new Error("provider unavailable");
      },
    };
    const result = await runAgentReview({ runner: failingRunner, useMocks: false, apiKey: "test-key" });
    assert.equal(result.mode, "fallback");
    assert.deepEqual(result.findings, mockFindings);
  });

  it("does not expose the API key in client-side source", async () => {
    const clientSources = await Promise.all([
      readFile(new URL("../components/jury-demo.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    ]);
    for (const source of clientSources) {
      assert.doesNotMatch(source, /OPENAI_API_KEY|NEXT_PUBLIC_.*KEY/);
    }
  });
});
