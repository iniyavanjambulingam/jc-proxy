export interface ProviderHealth {
  id: string;
  healthy: boolean;
  consecutiveFailures: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  totalSuccesses: number;
  totalFailures: number;
  rateLimitCount: number;
  avgLatency: number;
  activeRequests: number;
}

interface HealthSummary {
  totalProviders: number;
  healthyProviders: number;
  unhealthyProviders: number;
  totalActiveRequests: number;
  providers: Record<string, ProviderHealth>;
}

const LATENCY_WINDOW = 100;
const UNHEALTHY_THRESHOLD = 5;

class HealthService {
  private providers = new Map<string, ProviderHealth>();

  private getOrCreate(id: string): ProviderHealth {
    let h = this.providers.get(id);
    if (!h) {
      h = {
        id,
        healthy: true,
        consecutiveFailures: 0,
        lastSuccess: null,
        lastFailure: null,
        totalSuccesses: 0,
        totalFailures: 0,
        rateLimitCount: 0,
        avgLatency: 0,
        activeRequests: 0,
      };
      this.providers.set(id, h);
    }
    return h;
  }

  recordSuccess(id: string, latencyMs: number): void {
    const h = this.getOrCreate(id);
    h.totalSuccesses++;
    h.consecutiveFailures = 0;
    h.lastSuccess = Date.now();
    h.healthy = true;

    // Exponential moving average over last LATENCY_WINDOW samples
    const n = h.totalSuccesses;
    const alpha = n <= LATENCY_WINDOW ? 1 / n : 2 / (LATENCY_WINDOW + 1);
    h.avgLatency = h.avgLatency * (1 - alpha) + latencyMs * alpha;
  }

  recordFailure(id: string, status: number): void {
    const h = this.getOrCreate(id);
    h.totalFailures++;
    h.consecutiveFailures++;
    h.lastFailure = Date.now();
    if (status === 429) h.rateLimitCount++;
    if (h.consecutiveFailures >= UNHEALTHY_THRESHOLD) h.healthy = false;
  }

  startRequest(id: string): void {
    this.getOrCreate(id).activeRequests++;
  }

  endRequest(id: string): void {
    const h = this.getOrCreate(id);
    if (h.activeRequests > 0) h.activeRequests--;
  }

  getProvider(id: string): ProviderHealth {
    return { ...this.getOrCreate(id) };
  }

  getAll(): Record<string, ProviderHealth> {
    const out: Record<string, ProviderHealth> = {};
    for (const [id, h] of this.providers) {
      out[id] = { ...h };
    }
    return out;
  }

  summary(): HealthSummary {
    let healthy = 0;
    let totalActive = 0;
    for (const h of this.providers.values()) {
      if (h.healthy) healthy++;
      totalActive += h.activeRequests;
    }
    const total = this.providers.size;
    return {
      totalProviders: total,
      healthyProviders: healthy,
      unhealthyProviders: total - healthy,
      totalActiveRequests: totalActive,
      providers: this.getAll(),
    };
  }
}

export const healthService = new HealthService();
