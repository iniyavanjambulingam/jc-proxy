import { BaseProvider } from './base.js';
import { ChatRequest, ChatResponse, ProviderCapabilities, ProviderConfig, ProviderModel, StreamChunk } from '../types.js';

export class OpenAICompatibleProvider extends BaseProvider {
  getCapabilities(): ProviderCapabilities {
    return { tools: true, streaming: true, vision: true, embeddings: true, jsonMode: true, reasoning: true };
  }

  async listModels(): Promise<ProviderModel[]> {
    const res = await fetch(`${this.baseUrl}/models`, {
      headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
    });
    if (!res.ok) throw { status: res.status, body: await res.json() };
    const data = await res.json() as any;
    return data.data?.map((m: any) => ({
      id: m.id,
      object: 'model' as const,
      created: m.created || Date.now(),
      owned_by: this.id,
    })) || [];
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ...request, stream: false }),
    });
    if (!res.ok) throw { status: res.status, body: await res.json() };
    return res.json() as Promise<ChatResponse>;
  }

  async *stream(request: ChatRequest): AsyncGenerator<StreamChunk> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
        'Content-Type': 'application/json',
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
