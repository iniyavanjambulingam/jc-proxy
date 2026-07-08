import { getConfig } from '../config.js';

export function getFallbackChain(model: string): string[] {
  return getConfig().fallbackChains?.[model] ?? [];
}

export function hasFallback(model: string): boolean {
  return getFallbackChain(model).length > 0;
}
