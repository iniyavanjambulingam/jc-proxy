import Fastify from 'fastify';
import cors from '@fastify/cors';
import { loadConfig, getConfig } from './config.js';
import { registry } from './router.js';
import { logService } from './services/logService.js';
import { healthRoutes } from './routes/health.js';
import { modelsRoutes } from './routes/models.js';
import { chatRoutes } from './routes/chat.js';
import { adminRoutes } from './routes/admin.js';
import { anthropicRoutes } from './routes/anthropic.js';

import { existsSync, copyFileSync } from 'fs';

let configPath = process.env.CONFIG_PATH;
if (!configPath) {
  const localConfig = './config/config.yaml';
  const exampleConfig = './config/config.example.yaml';
  if (existsSync(localConfig)) {
    configPath = localConfig;
  } else if (existsSync(exampleConfig)) {
    try {
      copyFileSync(exampleConfig, localConfig);
      console.log('[config] Created ./config/config.yaml from ./config/config.example.yaml');
      configPath = localConfig;
    } catch (e) {
      console.warn('[config] Failed to copy config.example.yaml to config.yaml, using example config.', e);
      configPath = exampleConfig;
    }
  } else {
    configPath = exampleConfig;
  }
}
loadConfig(configPath);

const startupConfig = getConfig();
const startupHost = startupConfig.listen.host ?? '0.0.0.0';
const startupAdminKey = startupConfig.security.adminKey ?? '';
if (startupHost === '0.0.0.0' && !startupAdminKey) {
  console.error('Remote admin requires security.adminKey');
  process.exit(1);
}

await registry.init(startupConfig);

const app = Fastify({ logger: false });

await app.register(cors);
await app.register(healthRoutes);
await app.register(modelsRoutes);
await app.register(chatRoutes);
await app.register(adminRoutes);
await app.register(anthropicRoutes);

const { listen } = getConfig();
const port = listen.port;
const host = listen.host ?? '0.0.0.0';

await app.listen({ port, host });
console.log(`jcXproxy running on ${host}:${port}`);
logService.startFlushTimer();

let shuttingDown = false;

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down gracefully...`);
  logService.stopFlushTimer();
  await logService.flush();
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
