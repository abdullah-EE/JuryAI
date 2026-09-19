import { counterfactualRiskFlag, runDemoPostalCounterfactual } from "../counterfactual";
import { demoCase } from "../demo-case";
import { mockFindings } from "../mock-agents";
import { AgentFindingSchema, AgentReviewResultSchema, type AgentFinding, type CounterfactualResult } from "../schemas";
import { createAgentInputPacket, assertPacketWithinManifest } from "./input-packets";
import { agentDefinitions, agentRoles, cloneManifest, type AgentRole } from "./manifests";
import { OpenAIResponsesRunner } from "./openai-runner";
import { AgentModelOutputSchema, type AgentModelOutput } from "./output-schema";
import { InvalidAgentOutputError, type AgentRunner, type ProviderConfig } from "./runner";

type RunAgentsOptions = {
  runner?: AgentRunner;
  useMocks?: boolean;
  demoMode?: boolean;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
};

const sensitivityPattern = /counterfactual sensitivity|remov(?:e|ing).*postal.*(?:change|flip)|postal.*changed.*(?:outcome|recommendation)/i;
const prohibitedBiasClaimPattern = /bias (?:is )?proven|model is discriminatory|alternative is unbiased|decision is unbiased/i;

function groundedBiasOutput(output: AgentModelOutput, result: CounterfactualResult): AgentModelOutput {
  const ordinaryClaims = output.claims.filter((claim) =>
    !sensitivityPattern.test(claim.statement) && !prohibitedBiasClaimPattern.test(claim.statement),
  );
  const ordinaryRisks = output.risks.filter((risk) => {
    const text = `${risk.title} ${risk.description}`;
    return !sensitivityPattern.test(text) && !prohibitedBiasClaimPattern.test(text);
  });
  const counterfactualClaim = {
    statement: result.summary,
    status: "observed" as const,
  };
  const risk = counterfactualRiskFlag(result);
  return AgentModelOutputSchema.parse({
    ...output,
    recommendation: result.changedOutcome ? "Require human review for counterfactual sensitivity" : output.recommendation,
    claims: [counterfactualClaim, ...ordinaryClaims].slice(0, 4),
    risks: result.changedOutcome && risk
      ? [{
          type: risk.type,
          severity: risk.severity,
          title: risk.title,
          description: risk.description,
          evidenceReferences: risk.evidenceReferences,
        }, ...ordinaryRisks].slice(0, 3)
      : ordinaryRisks.map((item) =>
          item.type === "bias" && (item.severity === "high" || item.severity === "critical")
            ? { ...item, severity: "medium" as const }
            : item,
        ).slice(0, 3),
    evidenceReferences: Array.from(new Set(["EV-05", ...output.evidenceReferences])).slice(0, 5),
    dataUsed: Array.from(new Set(["Structured counterfactual result", ...output.dataUsed])).slice(0, 8),
  });
}

function mockFor(role: AgentRole): AgentFinding {
  const finding = mockFindings.find((item) => item.role === role);
  if (!finding) throw new Error(`Missing mock for ${role}`);
  return AgentFindingSchema.parse(structuredClone(finding));
}

function assembleFinding(role: AgentRole, output: AgentModelOutput, counterfactual: CounterfactualResult): AgentFinding {
  const definition = agentDefinitions[role];
  const groundedOutput = role === "bias_privacy_challenger" ? groundedBiasOutput(output, counterfactual) : output;
  const validated = AgentFindingSchema.safeParse({
    agentId: definition.agentId,
    role,
    displayName: definition.displayName,
    recommendation: groundedOutput.recommendation,
    confidence: groundedOutput.confidence,
    claims: groundedOutput.claims.map((claim, index) => ({ ...claim, id: `${definition.agentId}-CL-${index + 1}` })),
    evidenceReferences: groundedOutput.evidenceReferences,
    risks: groundedOutput.risks.map((riskItem, index) => ({
      ...riskItem,
      id: `${definition.agentId}-RF-${index + 1}`,
      sourceAgentId: definition.agentId,
    })),
    dataUsed: groundedOutput.dataUsed,
    inputManifest: cloneManifest(role),
    sealedInputDescription: definition.sealedInputDescription,
  });
  if (!validated.success) throw new InvalidAgentOutputError();
  return validated.data;
}

async function executeLiveAgent(
  role: AgentRole,
  runner: AgentRunner,
  provider: ProviderConfig,
  counterfactual: CounterfactualResult,
  allowCorrectionRetry: boolean,
): Promise<AgentFinding> {
  const definition = agentDefinitions[role];
  const inputPacket = createAgentInputPacket(role, demoCase, counterfactual);
  assertPacketWithinManifest(role, inputPacket);
  const maximumAttempts = allowCorrectionRetry ? 2 : 1;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    try {
      const output = await runner.run({
        role,
        inputPacket: structuredClone(inputPacket),
        outputSchema: AgentModelOutputSchema,
        provider,
        systemPrompt: definition.systemPrompt,
        correctionAttempt: attempt > 0,
      });
      return assembleFinding(role, output, counterfactual);
    } catch (error) {
      if (!(error instanceof InvalidAgentOutputError) || attempt === maximumAttempts - 1) throw error;
    }
  }
  throw new Error("Agent execution failed");
}

export async function runAgentReview(options: RunAgentsOptions = {}) {
  const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY;
  const useMocks = options.useMocks ?? process.env.USE_MOCK_AGENTS === "true";
  const demoMode = options.demoMode ?? process.env.DEMO_MODE === "true";
  const counterfactual = runDemoPostalCounterfactual(demoCase);
  const provider: ProviderConfig = {
    provider: "openai",
    model: options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    timeoutMs: options.timeoutMs ?? Number(process.env.AGENT_TIMEOUT_MS ?? (demoMode ? 5000 : 15000)),
    maxOutputTokens: options.maxOutputTokens ?? (demoMode ? 350 : 500),
  };
  if (useMocks || !apiKey) {
    return AgentReviewResultSchema.parse({ findings: agentRoles.map(mockFor), mode: "fallback", counterfactual });
  }

  const runner = options.runner ?? new OpenAIResponsesRunner(apiKey);
  const startedAt = Date.now();
  const results = await Promise.all(agentRoles.map(async (role) => {
    const roleStartedAt = Date.now();
    try {
      const finding = await executeLiveAgent(role, runner, provider, counterfactual, !demoMode);
      console.info("[agent-execution]", { role, status: "live", latencyMs: Date.now() - roleStartedAt, model: provider.model });
      return { finding, fallback: false };
    } catch {
      console.info("[agent-execution]", { role, status: "fallback", latencyMs: Date.now() - roleStartedAt, model: provider.model });
      return { finding: mockFor(role), fallback: true };
    }
  }));
  const mode = results.some((result) => result.fallback) ? "fallback" : "live";
  console.info("[agent-batch]", { status: mode, latencyMs: Date.now() - startedAt, model: provider.model });
  return AgentReviewResultSchema.parse({ findings: results.map((result) => result.finding), mode, counterfactual });
}
