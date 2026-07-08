import { BaseProvider } from './base.js';
import { ChatRequest, ChatResponse, ProviderCapabilities, ProviderConfig, ProviderModel, StreamChunk } from '../types.js';

export class CloudflareProvider extends BaseProvider {
  private accountId: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.accountId = config.accountId || '';
  }

  private get runUrl(): string {
    return this.baseUrl || `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/run`;
  }

  private get modelsUrl(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/ai/models/search`;
  }

  getCapabilities(): ProviderCapabilities {
    return { tools: false, streaming: true, vision: false, embeddings: false, jsonMode: false, reasoning: false };
  }

  async listModels(): Promise<ProviderModel[]> {
    const res = await fetch(this.modelsUrl, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = await res.json() as any;
    return data.result?.map((m: any) => ({
      id: m.id,
      object: 'model' as const,
      created: Date.now(),
      owned_by: 'cloudflare',
    })) || [];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const model = request.model.startsWith('@cf/') ? request.model : `@cf/meta/llama-3-8b-instruct`;
    const res = await fetch(`${this.runUrl}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: request.messages.map(m => ({ role: m.role, content: m.content || '' })),
        max_tokens: request.max_tokens,
        temperature: request.temperature,
      }),
    });
    if (!res.ok) throw { status: res.status, body: await res.json() };
    
    const data = await res.json() as any;
    return {
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Date.now(),
      model: request.model,
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: data.result?.response || '',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const model = request.model.startsWith('@cf/') ? request.model : `@cf/meta/llama-3-8b-instruct`;
    const res = await fetch(`${this.runUrl}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: request.messages.map(m => ({ role: m.role, content: m.content || '' })),
        max_tokens: request.max_tokens,
        temperature: request.temperature,
        stream: true,
      }),
    });
    if (!res.ok) throw { status: res.status, body: await res.json() };

    const reader = res.body?.getReader();
    if (!reader) return;

    const decoder = new TextDecoder();
    let buffer = '';

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
            if (data.response) {
              yield {
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Date.now(),
                model: request.model,
                choices: [{
                  index: 0,
                  delta: { content: data.response },
                  finish_reason: null,
                }],
              };
            }
          } catch {}
        }
      }
    }
  }
}
