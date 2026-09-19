import { z } from "zod";
import { InvalidAgentOutputError } from "../agents/runner";
import type { CourtSessionRequest, CourtSessionRunner } from "./session-runner";

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
};

function outputText(payload: OpenAIResponse) {
  if (payload.output_text) return payload.output_text;
  for (const item of payload.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return null;
}

export class OpenAICourtSessionRunner implements CourtSessionRunner {
  constructor(private readonly apiKey: string, private readonly fetchImpl: typeof fetch = fetch) {}

  async run<TOutput>(request: CourtSessionRequest<TOutput>): Promise<TOutput> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.provider.timeoutMs);
    try {
      const response = await this.fetchImpl("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.provider.model,
          instructions: request.systemPrompt,
          input: JSON.stringify(request.input),
          text: { format: { type: "json_schema", name: `juryai_${request.kind}`, strict: true, schema: z.toJSONSchema(request.outputSchema) } },
          max_output_tokens: request.provider.maxOutputTokens,
          store: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Provider request failed with status ${response.status}`);
      const text = outputText(await response.json() as OpenAIResponse);
      if (!text) throw new InvalidAgentOutputError();
      let value: unknown;
      try { value = JSON.parse(text); } catch { throw new InvalidAgentOutputError(); }
      const parsed = request.outputSchema.safeParse(value);
      if (!parsed.success) throw new InvalidAgentOutputError();
      return parsed.data;
    } finally {
      clearTimeout(timer);
    }
  }
}

