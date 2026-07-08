import { readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { AppConfig } from './types.js';

let config: AppConfig | null = null;
let configPath: string = '';

function migrateConfig(rawConfig: any): AppConfig {
  // Backward compatibility: migrate root-level apiKeys to security.apiKeys
  if (rawConfig.apiKeys && !rawConfig.security) {
    console.warn('[config] DEPRECATED: root-level "apiKeys" is deprecated. Migrating to "security.apiKeys".');
    rawConfig.security = { apiKeys: rawConfig.apiKeys, adminKey: '' };
    delete rawConfig.apiKeys;
  }

  // Normalize apiKeys: convert string entries to { key } objects
  if (rawConfig.security?.apiKeys) {
    rawConfig.security.apiKeys = rawConfig.security.apiKeys.map((k: any) => {
      if (typeof k === 'string') return { key: k };
      return k;
    });
  }

  // Ensure security section exists
  if (!rawConfig.security) {
    rawConfig.security = { apiKeys: [], adminKey: '' };
  }

  return rawConfig as AppConfig;
}

export function loadConfig(path: string): AppConfig {
  configPath = path;
  const content = readFileSync(path, 'utf8');
  const rawConfig = yaml.load(content) as any;
  config = migrateConfig(rawConfig);
  return config;
}

export function getConfig(): AppConfig {
  if (!config) throw new Error('Config not loaded');
  return config;
}

export function saveConfig(): void {
  if (!config || !configPath) throw new Error('Config not loaded');
  writeFileSync(configPath, yaml.dump(config, { lineWidth: -1 }));
}

export function updateConfig(updater: (cfg: AppConfig) => void): AppConfig {
  if (!config) throw new Error('Config not loaded');
  updater(config);
  saveConfig();
  return config;
}
