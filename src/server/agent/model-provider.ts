import { z } from 'zod';
import { FINANCE_TOOLS } from './tool-registry';

export type ModelMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: Array<{ callId: string; name: string; arguments: unknown }>;
};

export type ModelTool = { name: string; description: string; parameters: Record<string, unknown> };

export interface ModelTurnInput {
  messages: ModelMessage[];
  tools: ModelTool[];
  allowToolCalls: boolean;
}

export type ModelTurnOutput =
  | { type: 'message'; text: string }
  | { type: 'tool_calls'; calls: Array<{ callId: string; name: string; arguments: unknown }> };

export interface ModelProvider {
  completeTurn(input: ModelTurnInput): Promise<ModelTurnOutput>;
}

const providerResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({
      content: z.union([z.string(), z.null()]).optional(),
      tool_calls: z.array(z.object({
        id: z.string().min(1),
        function: z.object({ name: z.string().min(1), arguments: z.string() }),
      })).optional(),
    }),
  })).min(1),
}).passthrough();

function parseArguments(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

export function financeModelTools(): ModelTool[] {
  return FINANCE_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.inputSchema) as Record<string, unknown>,
  }));
}

export class KiosApiModelProvider implements ModelProvider {
  constructor(
    private readonly config: { baseUrl?: string; apiKey?: string; model?: string; timeoutMs?: number } = {},
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async completeTurn(input: ModelTurnInput): Promise<ModelTurnOutput> {
    const apiKey = this.config.apiKey ?? process.env.KIOSAPI_API_KEY;
    if (!apiKey?.trim()) throw new Error('KiosAPI is not configured.');

    const baseUrl = (this.config.baseUrl ?? process.env.KIOSAPI_BASE_URL ?? 'https://kiosapi.com/v1').replace(/\/+$/, '');
    const model = this.config.model ?? process.env.WAKEEL_MODEL ?? 'deepseek-v4-flash-0731-free';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 45_000);

    try {
      const response = await this.fetcher(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: input.messages.map((message) => ({
            role: message.role,
            content: message.content,
            ...(message.toolCallId ? { tool_call_id: message.toolCallId } : {}),
            ...(message.toolCalls ? { tool_calls: message.toolCalls.map((call) => ({
              id: call.callId,
              type: 'function',
              function: { name: call.name, arguments: JSON.stringify(call.arguments) },
            })) } : {}),
          })),
          ...(input.allowToolCalls && input.tools.length ? {
            tools: input.tools.map((tool) => ({
              type: 'function',
              function: { name: tool.name, description: tool.description, parameters: tool.parameters },
            })),
            tool_choice: 'auto',
            parallel_tool_calls: false,
          } : {}),
          temperature: 0.1,
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`KiosAPI request failed with HTTP ${response.status}.`);
      const parsed = providerResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('KiosAPI returned an invalid chat completion.');

      const message = parsed.data.choices[0].message;
      const calls = message.tool_calls ?? [];
      if (calls.length) {
        return { type: 'tool_calls', calls: calls.map((call) => ({
          callId: call.id,
          name: call.function.name,
          arguments: parseArguments(call.function.arguments),
        })) };
      }
      return { type: 'message', text: message.content ?? '' };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createDefaultModelProvider(): ModelProvider {
  return new KiosApiModelProvider();
}
