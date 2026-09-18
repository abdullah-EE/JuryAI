import type { ZodType } from "zod";
import type { AgentInputPacket } from "./input-packets";
import type { AgentRole } from "./manifests";

export type ProviderConfig = {
  provider: "openai";
  model: string;
  timeoutMs: number;
};

export type AgentRunRequest<TOutput> = {
  role: AgentRole;
  inputPacket: AgentInputPacket;
  outputSchema: ZodType<TOutput>;
  provider: ProviderConfig;
  systemPrompt: string;
  correctionAttempt: boolean;
};

export interface AgentRunner {
  run<TOutput>(request: AgentRunRequest<TOutput>): Promise<TOutput>;
}

export class InvalidAgentOutputError extends Error {
  constructor() {
    super("Provider returned an invalid structured agent output");
    this.name = "InvalidAgentOutputError";
  }
}

