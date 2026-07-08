import { AppConfig, DiscoveredModel, ProviderCapabilities, ProviderConfig } from '../types.js';
import { BaseProvider } from '../providers/base.js';
import { GroqProvider } from '../providers/groq.js';
import { GeminiProvider } from '../providers/gemini.js';
import { OpenRouterProvider } from '../providers/openrouter.js';
import { CloudflareProvider } from '../providers/cloudflare.js';
import { OpenAICompatibleProvider } from '../providers/openai-compatible.js';

class ProviderRegistry {
  private providers = new Map<string, BaseProvider>();
  private discoveredModels = new Map<string, DiscoveredModel[]>();
  private rawDiscoveredModels = new Map<string, DiscoveredModel[]>();
  private roundRobinIndex = 0;
  private config: AppConfig | null = null;

  async init(config: AppConfig): Promise<void> {
    this.config = config;
    this.providers.clear();
    this.discoveredModels.clear();
    this.rawDiscoveredModels.clear();
    this.roundRobinIndex = 0;

    for (const p of config.routing.providers) {
      const provider = this.createProvider(p);
      if (provider) {
        this.providers.set(p.id, provider);
        await this.discoverModels(p.id);
      }
    }
  }

  private createProvider(config: ProviderConfig): BaseProvider | null {
    switch (config.type) {
      case 'groq': return new GroqProvider(config);
      case 'gemini': return new GeminiProvider(config);
      case 'openrouter': return new OpenRouterProvider(config);
      case 'cloudflare': return new CloudflareProvider(config);
      case 'openai-compatible': return new OpenAICompatibleProvider(config);
      default: return null;
    }
  }

  private async discoverModels(providerId: string): Promise<void> {
    const provider = this.providers.get(providerId);
    if (!provider) return;

    const providerConfig = this.config?.routing.providers.find(p => p.id === providerId);
    const models: DiscoveredModel[] = [];

    // Discover from API
    try {
      const discovered = await provider.getAvailableModels();
      for (const id of discovered) {
        models.push({ id, providerId, source: 'discovered' });
      }
    } catch (err: any) {
      console.log(`[${providerId}] Model discovery failed: ${err.message || err}`);
    }

    // Add custom models
    if (providerConfig?.customModels) {
      for (const id of providerConfig.customModels) {
        if (!models.some(m => m.id === id)) {
          models.push({ id, providerId, source: 'custom' });
        }
      }
    }

    // Add dedicated models
    if (providerConfig?.dedicatedModels) {
      for (const id of providerConfig.dedicatedModels) {
        if (!models.some(m => m.id === id)) {
          models.push({ id, providerId, source: 'dedicated' });
        }
      }
    }

    this.rawDiscoveredModels.set(providerId, models);

    let finalModels = models;
    if (providerConfig?.enabledModels && providerConfig.enabledModels.length > 0) {
      finalModels = models.filter(m => 
        providerConfig.enabledModels!.includes(m.id) || 
        m.source === 'custom' || 
        m.source === 'dedicated'
      );
    }

    this.discoveredModels.set(providerId, finalModels);
    console.log(`[${providerId}] ${finalModels.length}/${models.length} models loaded (${finalModels.filter(m => m.source === 'discovered').length} discovered, ${finalModels.filter(m => m.source === 'custom').length} custom, ${finalModels.filter(m => m.source === 'dedicated').length} dedicated)`);
  }

  async refreshModels(providerId: string): Promise<DiscoveredModel[]> {
    const provider = this.providers.get(providerId);
    if (!provider) return [];

    // Keep existing custom and dedicated models
    const existing = this.discoveredModels.get(providerId) || [];
    const customModels = existing.filter(m => m.source === 'custom');
    const dedicatedModels = existing.filter(m => m.source === 'dedicated');

    const models: DiscoveredModel[] = [];

    // Re-discover from API
    try {
      const discovered = await provider.getAvailableModels();
      for (const id of discovered) {
        models.push({ id, providerId, source: 'discovered' });
      }
    } catch (err: any) {
      console.log(`[${providerId}] Model refresh failed: ${err.message || err}`);
    }

    // Merge back custom and dedicated
    for (const m of [...customModels, ...dedicatedModels]) {
      if (!models.some(x => x.id === m.id)) {
        models.push(m);
      }
    }

    this.rawDiscoveredModels.set(providerId, models);

    const providerConfig = this.config?.routing.providers.find(p => p.id === providerId);
    let finalModels = models;
    if (providerConfig?.enabledModels && providerConfig.enabledModels.length > 0) {
      finalModels = models.filter(m => 
        providerConfig.enabledModels!.includes(m.id) || 
        m.source === 'custom' || 
        m.source === 'dedicated'
      );
    }

    this.discoveredModels.set(providerId, finalModels);
    return finalModels;
  }

  resolveModel(model: string): { provider: BaseProvider; modelName: string } | null {
    if (!this.config) return null;

    // 1. Check dedicated models first (highest priority)
    for (const [providerId, models] of this.discoveredModels) {
      const dedicated = models.filter(m => m.source === 'dedicated');
      if (dedicated.some(m => m.id === model)) {
        const provider = this.providers.get(providerId);
        if (provider) return { provider, modelName: model };
      }
    }

    // 2. Check aliases
    const aliasModels = this.config.aliases?.[model];
    if (aliasModels) {
      for (const aliasModel of aliasModels) {
        const result = this.resolveModelByProviderPrefix(aliasModel);
        if (result) return result;
      }
      // If alias resolved but no provider found, try first available
      const firstAlias = aliasModels[0];
      if (firstAlias) {
        const result = this.resolveModelByProviderPrefix(firstAlias);
        if (result) return result;
      }
    }

    // 3. Check provider prefix (e.g. "groq/model")
    const prefixResult = this.resolveModelByProviderPrefix(model);
    if (prefixResult) return prefixResult;

    // 4. Fall back to routing strategy
    return this.resolveByRoutingStrategy(model);
  }

  private resolveModelByProviderPrefix(model: string): { provider: BaseProvider; modelName: string } | null {
    const slash = model.indexOf('/');
    if (slash <= 0) return null;

    const prefix = model.slice(0, slash);
    const modelName = model.slice(slash + 1);

    if (this.providers.has(prefix)) {
      return { provider: this.providers.get(prefix)!, modelName };
    }
    return null;
  }

  private resolveByRoutingStrategy(model: string): { provider: BaseProvider; modelName: string } | null {
    if (!this.config) return null;

    const candidates = this.config.routing.providers
      .filter(p => {
        if (!this.providers.has(p.id)) return false;
        const models = this.discoveredModels.get(p.id) || [];
        return models.some(m => m.id === model);
      })
      .map(p => this.providers.get(p.id)!);

    if (candidates.length === 0) return null;

    switch (this.config.routing.mode) {
      case 'round-robin': {
        const idx = this.roundRobinIndex % candidates.length;
        this.roundRobinIndex++;
        return { provider: candidates[idx], modelName: model };
      }
      case 'random': {
        const idx = Math.floor(Math.random() * candidates.length);
        return { provider: candidates[idx], modelName: model };
      }
      case 'priority':
      default:
        return { provider: candidates[0], modelName: model };
    }
  }

  getFailoverProviders(model: string, excludeId: string): BaseProvider[] {
    if (!this.config) return [];

    return this.config.routing.providers
      .filter(p => {
        if (p.id === excludeId || !this.providers.has(p.id)) return false;
        const models = this.discoveredModels.get(p.id) || [];
        return models.some(m => m.id === model);
      })
      .map(p => this.providers.get(p.id)!);
  }

  getProvider(id: string): BaseProvider | undefined {
    return this.providers.get(id);
  }

  getAllProviders(): BaseProvider[] {
    return Array.from(this.providers.values());
  }

  getDiscoveredModels(providerId: string): DiscoveredModel[] {
    return this.discoveredModels.get(providerId) || [];
  }

  getRawDiscoveredModels(providerId: string): DiscoveredModel[] {
    return this.rawDiscoveredModels.get(providerId) || [];
  }

  getAllDiscoveredModels(): DiscoveredModel[] {
    const all: DiscoveredModel[] = [];
    for (const models of this.discoveredModels.values()) {
      all.push(...models);
    }
    return all;
  }

  getCapabilities(providerId: string): ProviderCapabilities | null {
    return this.providers.get(providerId)?.getCapabilities() || null;
  }

  getProviderConfig(providerId: string): ProviderConfig | undefined {
    return this.config?.routing.providers.find(p => p.id === providerId);
  }
}

export const registry = new ProviderRegistry();
