import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { adminRoutes } from '../routes/admin.js';
import { healthRoutes } from '../routes/health.js';
import { modelsRoutes } from '../routes/models.js';
import { chatRoutes } from '../routes/chat.js';

const ADMIN_KEY = 'test-admin-key';
const API_KEY = 'test-api-key';

let app: any;
let configPath: string;
let sessionCookie: string;

beforeAll(async () => {
  process.env.CONFIG_PATH = '';

  const { loadConfig, getConfig } = await import('../config.js');
  const { registry } = await import('../router.js');

  const { writeFileSync, mkdirSync } = await import('fs');
  const { join } = await import('path');
  const tmpDir = join(process.cwd(), '.test-tmp-fallback');
  mkdirSync(tmpDir, { recursive: true });
  configPath = join(tmpDir, 'test-config.yaml');

  const yaml = (await import('js-yaml')).default;
  const testConfig = {
    listen: { port: 0, host: '127.0.0.1' },
    security: {
      apiKeys: [{ key: API_KEY, allowedModels: [] }],
      adminKey: ADMIN_KEY,
    },
    routing: { mode: 'priority' as const, providers: [] },
    aliases: {},
    fallbackChains: {
      'gemini-2.5-flash': ['gemini-1.5-flash', 'llama-3.3-70b-versatile'],
      'claude-sonnet-4': ['gemini-2.5-flash', 'gemini-1.5-flash', 'llama-3.3-70b-versatile'],
    },
    webSearch: {},
  };
  writeFileSync(configPath, yaml.dump(testConfig));

  loadConfig(configPath);
  await registry.init(getConfig());

  app = Fastify({ logger: false });
  await app.register(healthRoutes);
  await app.register(modelsRoutes);
  await app.register(chatRoutes);
  await app.register(adminRoutes);
  await app.ready();

  // Login to get session cookie
  const loginRes = await app.inject({
    method: 'POST',
    url: '/admin/api/login',
    payload: { adminKey: ADMIN_KEY },
  });
  const setCookie = loginRes.headers['set-cookie'];
  if (setCookie) {
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const cookie = cookies.find((c: string) => c.startsWith('jc_admin_session='));
    sessionCookie = cookie ? cookie.split(';')[0] : '';
  }
});

afterAll(async () => {
  if (app) await app.close();
  const { rmSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const tmpDir = join(process.cwd(), '.test-tmp-fallback');
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

function authHeaders() {
  return { cookie: sessionCookie };
}

describe('Fallback chains — GET /admin/api/fallbacks', () => {
  it('returns configured fallback chains', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.fallbackChains).toBeDefined();
    expect(body.fallbackChains['gemini-2.5-flash']).toEqual(['gemini-1.5-flash', 'llama-3.3-70b-versatile']);
    expect(body.fallbackChains['claude-sonnet-4']).toEqual(['gemini-2.5-flash', 'gemini-1.5-flash', 'llama-3.3-70b-versatile']);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/fallbacks' });
    expect(res.statusCode).toBe(401);
  });
});

describe('Fallback chains — PUT /admin/api/fallbacks', () => {
  it('updates configuration successfully', async () => {
    const newChains = {
      'gemini-2.5-flash': ['llama-3.3-70b-versatile'],
      'custom-model': ['fallback-a', 'fallback-b'],
    };
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: newChains,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);

    const getRes = await app.inject({
      method: 'GET',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
    });
    const body = getRes.json();
    expect(body.fallbackChains['gemini-2.5-flash']).toEqual(['llama-3.3-70b-versatile']);
    expect(body.fallbackChains['custom-model']).toEqual(['fallback-a', 'fallback-b']);
  });

  it('accepts empty fallbackChains object', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
  });

  it('rejects non-object payload', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      payload: '"not-an-object"',
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects array payload', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: ['a', 'b'],
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects chain with non-array fallbacks', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: { 'model-a': 'not-an-array' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects chain with non-string fallback models', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: { 'model-a': [123, true] },
    });
    expect(res.statusCode).toBe(400);
  });

  it('rejects empty primary model name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: { '': ['fallback-a'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Empty primary model name');
  });

  it('rejects empty fallback model name', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: { 'model-a': [''] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Empty model name');
  });

  it('rejects duplicate models in same chain', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: { 'model-a': ['fallback-b', 'fallback-b'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Duplicate model');
  });

  it('rejects circular reference A -> B and B -> A', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: {
        'model-a': ['model-b'],
        'model-b': ['model-a'],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Circular reference');
  });

  it('rejects longer circular chain A -> B -> C -> A', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: {
        'model-a': ['model-b'],
        'model-b': ['model-c'],
        'model-c': ['model-a'],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain('Circular reference');
  });

  it('allows same model in different chains', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: {
        'model-a': ['shared-fallback'],
        'model-b': ['shared-fallback'],
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows multiple fallback levels without cycles', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: {
        'model-a': ['model-b'],
        'model-b': ['model-c'],
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('ignores unknown models without crashing', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      headers: authHeaders(),
      payload: {
        'unknown-primary': ['unknown-fallback-a', 'unknown-fallback-b'],
      },
    });
    expect(res.statusCode).toBe(200);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/admin/api/fallbacks',
      payload: { 'model-a': ['fallback-a'] },
    });
    expect(res.statusCode).toBe(401);
  });
});