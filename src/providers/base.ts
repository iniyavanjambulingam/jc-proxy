import { ChatRequest, ChatResponse, ProviderConfig, ProviderCapabilities, ProviderModel, StreamChunk, HealthStatus } from '../types.js';
import { logService } from '../services/logService.js';

const RATE_LIMIT_COOLDOWN_MS = 60_000; // 60 seconds

export abstract class BaseProvider {
  protected apiKey: string;
  protected baseUrl: string;
  protected providerConfig: ProviderConfig;
  public id: string;

  constructor(config: ProviderConfig) {
    this.id = config.id;
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || '';
    this.providerConfig = config;
  }

  abstract listModels(): Promise<ProviderModel[]>;
  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract stream(request: ChatRequest): AsyncGenerator<StreamChunk>;
  abstract getCapabilities(): ProviderCapabilities;
  countTokens?(request: ChatRequest): Promise<number>;

  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await this.listModels();
      return models.map(m => m.id);
    } catch {
      return [];
    }
  }

  get health(): HealthStatus {
    return BaseProvider.healthMap.get(this.id) || {
      healthy: true,
      latency: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
      lastFailure: null,
    };
  }

  /** Returns true if this provider is in a 429 cooldown window */
  isRateLimited(): boolean {
    const until = BaseProvider.rateLimitMap.get(this.id);
    if (!until) return false;
    if (Date.now() < until) return true;
    BaseProvider.rateLimitMap.delete(this.id); // expired
    return false;
  }

  static healthMap = new Map<string, HealthStatus>();
  static rateLimitMap = new Map<string, number>(); // id → epoch ms until cooldown expires

  static recordSuccess(id: string, latency: number) {
    const h = this.healthMap.get(id) || {
      healthy: true,
      latency: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
      lastFailure: null,
    };
    h.successCount++;
    h.latency = latency;
    h.healthy = true;
    this.healthMap.set(id, h);
    // Clear rate limit on success
    this.rateLimitMap.delete(id);
  }

  static recordFailure(id: string, status: number) {
    const h = this.healthMap.get(id) || {
      healthy: true,
      latency: 0,
      successCount: 0,
      failureCount: 0,
      rateLimitCount: 0,
      lastFailure: null,
    };
    h.failureCount++;
    h.lastFailure = Date.now();
    if (status === 429) {
      h.rateLimitCount++;
      // Set cooldown: skip this provider for 60 seconds
      this.rateLimitMap.set(id, Date.now() + RATE_LIMIT_COOLDOWN_MS);
      logService.add({ level: 'warn', requestId: '', provider: id, model: '', endpoint: '', statusCode: 429, latencyMs: 0, message: `rate limited, cooldown ${RATE_LIMIT_COOLDOWN_MS / 1000}s` });
    }
    if (h.failureCount > 5) h.healthy = false;
    this.healthMap.set(id, h);
  }
}
