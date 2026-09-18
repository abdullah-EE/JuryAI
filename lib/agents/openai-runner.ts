import { z } from "zod";
import { InvalidAgentOutputError, type AgentRunRequest, type AgentRunner } from "./runner";

type FetchLike = typeof fetch;

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function extractOutputText(payload: OpenAIResponse): string | null {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return null;
}

export class OpenAIResponsesRunner implements AgentRunner {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async run<TOutput>(request: AgentRunRequest<TOutput>): Promise<TOutput> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.provider.timeoutMs);
    try {
      const correction = request.correctionAttempt
        ? " Previous output failed validation. Return only a value that exactly matches the schema."
        : "";
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.provider.model,
          instructions: `${request.systemPrompt}${correction}`,
          input: JSON.stringify(request.inputPacket),
          text: {
            format: {
              type: "json_schema",
              name: `juryai_${request.role}`,
              strict: true,
              schema: z.toJSONSchema(request.outputSchema),
            },
          },
          max_output_tokens: 900,
          store: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Provider request failed with status ${response.status}`);
      const payload = await response.json() as OpenAIResponse;
      const text = extractOutputText(payload);
      if (!text) throw new InvalidAgentOutputError();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new InvalidAgentOutputError();
      }
      const validated = request.outputSchema.safeParse(parsed);
      if (!validated.success) throw new InvalidAgentOutputError();
      return validated.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}

