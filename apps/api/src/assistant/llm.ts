import { ServiceUnavailableException } from '@nestjs/common';

/**
 * A small, provider-neutral interface for chat models that can call tools.
 * Two adapters cover most hosted models: Anthropic's Messages API, and the
 * OpenAI-compatible Chat Completions API (OpenAI, Groq, OpenRouter, Gemini, local servers).
 */

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments */
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /**
   * Provider data that must be sent back untouched with the next request, such as the
   * "thought signature" Gemini attaches to tool calls. Opaque to everything else.
   */
  extra?: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ModelReply {
  text: string;
  toolCalls: ToolCall[];
}

export interface ChatModel {
  chat(req: { system: string; messages: ChatMessage[]; tools: ToolSpec[] }): Promise<ModelReply>;
}

export const CHAT_MODEL = Symbol('CHAT_MODEL');

const TIMEOUT_MS = 30_000;
/** Generous, because some models spend part of it thinking before they answer. */
const MAX_TOKENS = 4096;

/** Busy or rate-limited providers usually recover within a second or two, so those get one retry. */
const RETRYABLE = new Set([429, 500, 502, 503]);

async function post(url: string, headers: Record<string, string>, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException({ code: 'aiUnavailable' });
    }
    if (res.ok) return res.json() as Promise<any>;
    if (attempt === 0 && RETRYABLE.has(res.status)) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    // The provider's message stays in the server log; the user gets a plain "try again".
    console.error(`[assistant] model request failed: ${res.status} ${(await res.text()).slice(0, 500)}`);
    throw new ServiceUnavailableException({ code: 'aiUnavailable' });
  }
}

const parseArgs = (s: unknown): Record<string, unknown> => {
  if (s && typeof s === 'object') return s as Record<string, unknown>;
  try {
    return JSON.parse(String(s || '{}'));
  } catch {
    return {};
  }
};

export class AnthropicModel implements ChatModel {
  constructor(private key: string, private model: string, private baseUrl = 'https://api.anthropic.com') {}

  async chat({ system, messages, tools }: { system: string; messages: ChatMessage[]; tools: ToolSpec[] }): Promise<ModelReply> {
    // Anthropic wants tool results as blocks inside a user turn, merged when several follow each other.
    const out: { role: 'user' | 'assistant'; content: any }[] = [];
    for (const m of messages) {
      if (m.role === 'tool') {
        const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content };
        const last = out[out.length - 1];
        if (last?.role === 'user' && Array.isArray(last.content)) last.content.push(block);
        else out.push({ role: 'user', content: [block] });
      } else if (m.role === 'assistant') {
        const blocks: any[] = [];
        if (m.content) blocks.push({ type: 'text', text: m.content });
        for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
        out.push({ role: 'assistant', content: blocks });
      } else {
        out.push({ role: 'user', content: m.content });
      }
    }
    const r = await post(
      `${this.baseUrl.replace(/\/$/, '')}/v1/messages`,
      { 'x-api-key': this.key, 'anthropic-version': '2023-06-01' },
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        system,
        messages: out,
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })),
      },
    );
    const content: any[] = r.content ?? [];
    return {
      text: content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim(),
      toolCalls: content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, args: parseArgs(b.input) })),
    };
  }
}

export class OpenAICompatibleModel implements ChatModel {
  constructor(private key: string, private model: string, private baseUrl = 'https://api.openai.com/v1') {}

  async chat({ system, messages, tools }: { system: string; messages: ChatMessage[]; tools: ToolSpec[] }): Promise<ModelReply> {
    const out: any[] = [{ role: 'system', content: system }];
    for (const m of messages) {
      if (m.role === 'tool') out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
      else if (m.role === 'assistant') {
        out.push({
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length
            ? { tool_calls: m.toolCalls.map((c) => ({ ...c.extra, id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } })) }
            : {}),
        });
      } else out.push({ role: 'user', content: m.content });
    }
    const r = await post(
      `${this.baseUrl.replace(/\/$/, '')}/chat/completions`,
      { authorization: `Bearer ${this.key}` },
      {
        model: this.model,
        max_tokens: MAX_TOKENS,
        messages: out,
        tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
      },
    );
    const msg = r.choices?.[0]?.message ?? {};
    return {
      text: String(msg.content ?? '').trim(),
      toolCalls: (msg.tool_calls ?? []).map((c: any) => {
        const { id, type: _type, function: fn, ...extra } = c;
        return { id, name: fn?.name, args: parseArgs(fn?.arguments), ...(Object.keys(extra).length ? { extra } : {}) };
      }),
    };
  }
}

/** Builds the model from the environment. Without an API key the assistant is switched off. */
export function modelFromEnv(env = process.env): ChatModel | null {
  const key = env.AI_API_KEY;
  if (!key) return null;
  const provider = (env.AI_PROVIDER || 'anthropic').toLowerCase();
  if (provider === 'anthropic') return new AnthropicModel(key, env.AI_MODEL || 'claude-haiku-4-5', env.AI_BASE_URL || undefined);
  if (provider === 'openai') return new OpenAICompatibleModel(key, env.AI_MODEL || 'gpt-4o-mini', env.AI_BASE_URL || undefined);
  throw new Error(`AI_PROVIDER must be "anthropic" or "openai", not "${provider}".`);
}
