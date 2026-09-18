import { demoCase } from "../demo-case";
import { mockFindings } from "../mock-agents";
import { AgentFindingSchema, AgentReviewResultSchema, type AgentFinding } from "../schemas";
import { createAgentInputPacket, assertPacketWithinManifest } from "./input-packets";
import { agentDefinitions, agentRoles, cloneManifest, type AgentRole } from "./manifests";
import { OpenAIResponsesRunner } from "./openai-runner";
import { AgentModelOutputSchema, type AgentModelOutput } from "./output-schema";
import { InvalidAgentOutputError, type AgentRunner, type ProviderConfig } from "./runner";

type RunAgentsOptions = {
  runner?: AgentRunner;
  useMocks?: boolean;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
};

function mockFor(role: AgentRole): AgentFinding {
  const finding = mockFindings.find((item) => item.role === role);
  if (!finding) throw new Error(`Missing mock for ${role}`);
  return AgentFindingSchema.parse(structuredClone(finding));
}

function assembleFinding(role: AgentRole, output: AgentModelOutput): AgentFinding {
  const definition = agentDefinitions[role];
  const validated = AgentFindingSchema.safeParse({
    agentId: definition.agentId,
    role,
    displayName: definition.displayName,
    recommendation: output.recommendation,
    confidence: output.confidence,
    claims: output.claims.map((claim, index) => ({ ...claim, id: `${definition.agentId}-CL-${index + 1}` })),
    evidenceReferences: output.evidenceReferences,
    risks: output.risks.map((risk, index) => ({
      ...risk,
      id: `${definition.agentId}-RF-${index + 1}`,
      sourceAgentId: definition.agentId,
    })),
    dataUsed: output.dataUsed,
    inputManifest: cloneManifest(role),
    sealedInputDescription: definition.sealedInputDescription,
  });
  if (!validated.success) throw new InvalidAgentOutputError();
  return validated.data;
}

async function executeLiveAgent(role: AgentRole, runner: AgentRunner, provider: ProviderConfig): Promise<AgentFinding> {
  const definition = agentDefinitions[role];
  const inputPacket = createAgentInputPacket(role, demoCase);
  assertPacketWithinManifest(role, inputPacket);
  let correctionAttempt = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const output = await runner.run({
        role,
        inputPacket: structuredClone(inputPacket),
        outputSchema: AgentModelOutputSchema,
        provider,
        systemPrompt: definition.systemPrompt,
        correctionAttempt,
      });
      return assembleFinding(role, output);
    } catch (error) {
      if (!(error instanceof InvalidAgentOutputError) || attempt === 1) throw error;
      correctionAttempt = true;
    }
  }
  throw new Error("Agent execution failed");
}

export async function runAgentReview(options: RunAgentsOptions = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const useMocks = options.useMocks ?? process.env.USE_MOCK_AGENTS === "true";
  const provider: ProviderConfig = {
    provider: "openai",
    model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: options.timeoutMs ?? Number(process.env.AGENT_TIMEOUT_MS ?? 15000),
  };
  if (useMocks || !apiKey) {
    return AgentReviewResultSchema.parse({ findings: agentRoles.map(mockFor), mode: "fallback" });
  }

  const runner = options.runner ?? new OpenAIResponsesRunner(apiKey);
  const startedAt = Date.now();
  const results = await Promise.all(agentRoles.map(async (role) => {
    const roleStartedAt = Date.now();
    try {
      const finding = await executeLiveAgent(role, runner, provider);
      console.info("[agent-execution]", { role, status: "live", latencyMs: Date.now() - roleStartedAt, model: provider.model });
      return { finding, fallback: false };
    } catch {
      console.info("[agent-execution]", { role, status: "fallback", latencyMs: Date.now() - roleStartedAt, model: provider.model });
      return { finding: mockFor(role), fallback: true };
    }
  }));
  console.info("[agent-batch]", { status: results.some((result) => result.fallback) ? "fallback" : "live", latencyMs: Date.now() - startedAt, model: provider.model });
  return AgentReviewResultSchema.parse({
    findings: results.map((result) => result.finding),
    mode: results.some((result) => result.fallback) ? "fallback" : "live",
  });
}
