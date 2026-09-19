import type { ZodType } from "zod";
import type { ProviderConfig } from "../agents/runner";

export type CourtSessionKind = "evidence" | "juror" | "judge_issue";

export type CourtSessionRequest<TOutput> = {
  sessionId: string;
  kind: CourtSessionKind;
  input: unknown;
  outputSchema: ZodType<TOutput>;
  provider: ProviderConfig;
  systemPrompt: string;
};

export interface CourtSessionRunner {
  run<TOutput>(request: CourtSessionRequest<TOutput>): Promise<TOutput>;
}

