import { BaseProvider } from './base.js';
import { ChatRequest, ChatResponse, ProviderCapabilities, ProviderConfig, ProviderModel, StreamChunk, ChatMessage, Tool } from '../types.js';
import { SignatureStore } from '../utils/signature-store.js';

const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Shared across all GeminiProvider instances so signatures persist across channel failovers
const sharedSignatureStore = new SignatureStore();

export class GeminiProvider extends BaseProvider {
  private url: string;
  private thoughtCache = sharedSignatureStore;

  constructor(config: ProviderConfig) {
    super(config);
    this.url = config.baseUrl || DEFAULT_BASE_URL;
  }

  private getThoughtSignature(tc: any): string | undefined {
    return tc?.extra_content?.google?.thought_signature
      || (tc as any).thought_signature
      || undefined;
  }

  getCapabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, vision: true, embeddings: false, jsonMode: false, reasoning: true };
  }
  private mapModel(model: string): string {
    const map: Record<string, string> = {
      'gemini-pro': 'gemini-1.5-pro',
      'gemini-flash': 'gemini-1.5-flash',
    };
    return map[model] || model;
  }

  private mapMessages(messages: ChatMessage[]): { role: string; parts: any[] }[] {
    const contents: { role: string; parts: any[] }[] = [];

    // Pre-collect thought signatures from assistant tool_calls
    const thoughtSignatures = new Map<string, string>();
    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls) {
        for (const tc of m.tool_calls) {
          const sig = this.getThoughtSignature(tc);
          if (sig) thoughtSignatures.set(tc.id, sig);
        }
      }
    }

    let i = 0;
    while (i < messages.length) {
      const m = messages[i];

      // System messages → user/model exchange
      // Truncate to 12000 chars to handle large system prompts (e.g. Claude Code)
      if (m.role === 'system') {
        const text = (m.content || '').slice(0, 12000);
        contents.push({ role: 'user', parts: [{ text }] });
        contents.push({ role: 'model', parts: [{ text: 'Understood.' }] });
        i++;
        continue;
      }

      // Batch ALL consecutive tool messages into one user turn
      if (m.role === 'tool') {
        const parts: any[] = [];
        while (i < messages.length && messages[i].role === 'tool') {
          const tm = messages[i];
          const sig = this.getThoughtSignature(tm)
            || (tm.tool_call_id ? thoughtSignatures.get(tm.tool_call_id) : undefined)
            || (tm.tool_call_id ? this.thoughtCache.get(tm.tool_call_id) : undefined)
            || this.thoughtCache.get('last');

          const fnResponsePart: any = {
            functionResponse: {
              name: tm.name || 'function',
              response: { result: tm.content || '' },
            },
          };
          // thoughtSignature sits at the part level, not inside functionResponse
          if (sig) fnResponsePart.thoughtSignature = sig;
          parts.push(fnResponsePart);
          i++;
        }
        contents.push({ role: 'user', parts });
        continue;
      }

      // User / assistant messages
      const parts: any[] = [];

      if (m.multimodal_content?.length) {
        for (const p of m.multimodal_content) {
          if (p.type === 'text' && p.text) {
            parts.push({ text: p.text });
          } else if ((p.type === 'image' || p.type === 'document') && p.source) {
            parts.push({
              inlineData: {
                mimeType: p.source.media_type,
                data: p.source.data,
              },
            });
          }
        }
      } else if (m.content) {
        parts.push({ text: m.content });
      }

      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          const fnCallPart: any = {
            functionCall: {
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}'),
            },
          };
          const sig = this.getThoughtSignature(tc)
            || (tc.id ? this.thoughtCache.get(tc.id) : undefined)
            || this.thoughtCache.get('last');
          if (sig) fnCallPart.thoughtSignature = sig;
          parts.push(fnCallPart);
        }
      }

      if (parts.length) {
        const role = m.role === 'assistant' ? 'model' : 'user';
        contents.push({ role, parts });
      }
      i++;
    }

    return contents;
  }

  private sanitizeParams(params: any): any {
    if (!params || typeof params !== 'object') return params;
    // Fields not supported by Gemini's function declaration schema
    const UNSUPPORTED_KEYS = new Set([
      'additionalProperties', '$schema', '$ref', '$defs', '$id',
      'exclusiveMinimum', 'exclusiveMaximum',
      'multipleOf', 'contentEncoding', 'contentMediaType',
      'if', 'then', 'else', 'not',
      'unevaluatedProperties', 'unevaluatedItems',
      'dependentSchemas', 'dependentRequired',
      'prefixItems', 'contains', 'minContains', 'maxContains',
      'const', 'propertyNames', 'patternProperties',
    ]);
    const clean: any = Array.isArray(params) ? [] : {};
    for (const [key, value] of Object.entries(params)) {
      if (UNSUPPORTED_KEYS.has(key)) continue;
      if (typeof value === 'object' && value !== null) {
        clean[key] = this.sanitizeParams(value);
      } else {
        clean[key] = value;
      }
    }
    return clean;
  }

  private mapTools(tools: Tool[]): any[] | undefined {
    if (!tools?.length) return undefined;
    return [{
      functionDeclarations: tools.map(t => ({
        name: t.function.name,
        description: t.function.description || '',
        parameters: this.sanitizeParams(t.function.parameters) || { type: 'OBJECT', properties: {} },
      })),
    }];
  }

  private mapToolChoice(toolChoice: string | { type: string; function?: { name: string } } | undefined): any | undefined {
    if (!toolChoice) return undefined;
    if (typeof toolChoice === 'string') {
      if (toolChoice === 'none') return { functionCallingConfig: { mode: 'NONE' } };
      if (toolChoice === 'auto') return { functionCallingConfig: { mode: 'AUTO' } };
      if (toolChoice === 'required') return { functionCallingConfig: { mode: 'ANY' } };
      return undefined;
    }
    if (toolChoice.type === 'function' && toolChoice.function?.name) {
      return { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [toolChoice.function.name] } };
    }
    return undefined;
  }

  async listModels(): Promise<ProviderModel[]> {
    const res = await fetch(`${this.url}/models?key=${this.apiKey}`);
    const data = await res.json() as any;
    const discovered = data.models?.filter((m: any) => m.supportedGenerationMethods?.includes('generateContent'))
      .map((m: any) => ({
        id: m.name.replace('models/', ''),
        object: 'model' as const,
        created: Date.now(),
        owned_by: 'google',
      })) || [];

    // Always append standard and preview models so they are guaranteed to resolve
    const standardModels = [
      'gemini-3.1-flash-lite-preview',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-pro',
    ];

    for (const mId of standardModels) {
      if (!discovered.some((m: any) => m.id === mId)) {
        discovered.push({
          id: mId,
          object: 'model' as const,
          created: Date.now(),
          owned_by: 'google',
        });
      }
    }

    return discovered;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = this.mapModel(request.model);
    const lastSignature = this.thoughtCache.get('last');
    const body: any = {
      contents: this.mapMessages(request.messages),
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
      },
    };

    const tools = this.mapTools(request.tools || []);
    if (tools) body.tools = tools;

    const toolConfig = this.mapToolChoice(request.tool_choice);
    if (toolConfig) body.toolConfig = toolConfig;

    const res = await fetch(
      `${this.url}/models/${model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) {
      const errBody = await res.json();
      console.error('[gemini] non-ok response', res.status, JSON.stringify(errBody, null, 2));
      console.error('[gemini] request body was:', JSON.stringify(body, null, 2));
      throw { status: res.status, body: errBody };
    }

    const data = await res.json() as any;
    const candidate = data.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let content: string | null = null;
    const toolCalls: any[] = [];
    let thoughtSignature: string | null = null;

    for (const part of parts) {
      if (part.thought && part.thoughtSignature) {
        thoughtSignature = part.thoughtSignature;
      }
      if (part.text) content = part.text;
      if (part.functionCall) {
        const fnId = part.functionCall.id || `call_${Date.now()}_${toolCalls.length}`;
        const toolCall: any = {
          id: fnId,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
        };
        const sig = part.thoughtSignature || thoughtSignature || this.thoughtCache.get('last');
        if (sig) {
          toolCall.extra_content = {
            google: {
              thought_signature: sig,
            },
          };
          this.thoughtCache.set(fnId, sig);
        }
        toolCalls.push(toolCall);
      }
    }

    if (thoughtSignature) {
      this.thoughtCache.set('last', thoughtSignature);
    }

    const finishReason = candidate?.finishReason === 'STOP' ? 'stop'
      : candidate?.finishReason === 'MAX_TOKENS' ? 'length'
      : toolCalls.length > 0 ? 'tool_calls' : 'stop';

    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason,
      }],
      usage: {
        prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
        completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: data.usageMetadata?.totalTokenCount || 0,
      },
    };
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const model = this.mapModel(request.model);
    const lastSignature = this.thoughtCache.get('last');
    const body: any = {
      contents: this.mapMessages(request.messages),
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
      },
    };

    const tools = this.mapTools(request.tools || []);
    if (tools) body.tools = tools;

    const toolConfig = this.mapToolChoice(request.tool_choice);
    if (toolConfig) body.toolConfig = toolConfig;

    const res = await fetch(
      `${this.url}/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    if (!res.ok) throw { status: res.status, body: await res.json() };

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';
    
    // Stable ID mapping for the duration of this stream
    const toolCallIds = new Map<string, string>();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            const parts = data.candidates?.[0]?.content?.parts || [];

            for (const part of parts) {
              if (part.thoughtSignature) {
                this.thoughtCache.set('last', part.thoughtSignature);
                // Stably associate this signature with all tool calls generated in this stream so far
                for (const fnId of toolCallIds.values()) {
                  this.thoughtCache.set(fnId, part.thoughtSignature);
                }
              }
              if (part.text) {
                yield {
                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: request.model,
                  choices: [{
                    index: 0,
                    delta: { content: part.text },
                    finish_reason: null,
                  }],
                };
              }
              if (part.functionCall) {
                const fnName = part.functionCall.name;
                const fnId = toolCallIds.get(fnName) || (() => {
                  const id = `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                  toolCallIds.set(fnName, id);
                  return id;
                })();

                const streamToolCall: any = {
                  index: 0,
                  id: fnId,
                  type: 'function',
                  function: {
                    name: fnName,
                    arguments: JSON.stringify(part.functionCall.args || {}),
                  },
                };
                const sig = part.thoughtSignature || this.thoughtCache.get('last');
                if (sig) {
                  streamToolCall.extra_content = {
                    google: {
                      thought_signature: sig,
                    },
                  };
                  this.thoughtCache.set(fnId, sig);
                }
                yield {

                  id: `chatcmpl-${Date.now()}`,
                  object: 'chat.completion.chunk',
                  created: Date.now(),
                  model: request.model,
                  choices: [{
                    index: 0,
                    delta: { tool_calls: [streamToolCall] },
                    finish_reason: null,
                  }],
                };
              }
            }
          } catch {}
        }
      }
    }
  }

  async countTokens(request: ChatRequest): Promise<number> {
    const model = this.mapModel(request.model);
    const body = {
      contents: this.mapMessages(request.messages),
    };
    try {
      const res = await fetch(`${this.url}/models/${model}:countTokens?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`Gemini countTokens failed: ${res.statusText}`);
      }
      const data = await res.json() as any;
      return data.totalTokens || 0;
    } catch (err: any) {
      console.error(`[gemini] countTokens failed for ${model}:`, err.message || err);
      // Fallback to simple estimation
      let chars = 0;
      for (const m of request.messages) {
        chars += (m.content || '').length;
      }
      return Math.ceil(chars / 4);
    }
  }
}
