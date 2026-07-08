import { BaseProvider } from './base.js';
import { ChatRequest, ChatResponse, ProviderCapabilities, ProviderConfig, ProviderModel, StreamChunk } from '../types.js';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export class OpenRouterProvider extends BaseProvider {
  private url: string;

  constructor(config: ProviderConfig) {
    super(config);
    this.url = config.baseUrl || DEFAULT_BASE_URL;
  }

  getCapabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, vision: true, embeddings: false, jsonMode: true, reasoning: true };
  }

  async listModels(): Promise<ProviderModel[]> {
    const res = await fetch(`${this.url}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = await res.json() as any;
    return data.data?.map((m: any) => ({
      id: m.id,
      object: 'model' as const,
      created: m.created || Date.now(),
      owned_by: 'openrouter',
    })) || [];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${this.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jcxproxy',
      },
      body: JSON.stringify({ ...request, stream: false }),
    });
    if (!res.ok) throw { status: res.status, body: await res.json() };
    return res.json() as Promise<ChatResponse>;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.url}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/jcxproxy',
      },
      body: JSON.stringify({ ...request, stream: true }),
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
          const data = line.slice(6);
          if (data === '[DONE]') return;
          try {
            yield JSON.parse(data) as StreamChunk;
          } catch {}
        }
      }
    }
  }
}
