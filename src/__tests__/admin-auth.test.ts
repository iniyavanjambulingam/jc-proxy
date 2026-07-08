import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { healthRoutes } from '../routes/health.js';
import { modelsRoutes } from '../routes/models.js';
import { adminRoutes } from '../routes/admin.js';
import { chatRoutes } from '../routes/chat.js';

const ADMIN_KEY = 'test-admin-key';
const API_KEY = 'test-api-key';

let app: any;

beforeAll(async () => {
  process.env.CONFIG_PATH = '';

  const { loadConfig, getConfig } = await import('../config.js');
  const { registry } = await import('../router.js');

  const { writeFileSync, mkdirSync } = await import('fs');
  const { join } = await import('path');
  const tmpDir = join(process.cwd(), '.test-tmp');
  mkdirSync(tmpDir, { recursive: true });
  const configPath = join(tmpDir, 'test-config.yaml');

  const yaml = (await import('js-yaml')).default;
  const testConfig = {
    listen: { port: 0, host: '127.0.0.1' },
    security: {
      apiKeys: [{ key: API_KEY, allowedModels: [] }],
      adminKey: ADMIN_KEY,
    },
    routing: { mode: 'priority' as const, providers: [] },
    aliases: {},
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
});

afterAll(async () => {
  if (app) await app.close();
  const { rmSync, existsSync } = await import('fs');
  const { join } = await import('path');
  const tmpDir = join(process.cwd(), '.test-tmp');
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

async function loginAsAdmin(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/admin/api/login',
    payload: { adminKey: ADMIN_KEY },
  });
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  // set-cookie can be a string or array of strings
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  const sessionCookie = cookies.find((c: string) => c.startsWith('jc_admin_session='));
  return sessionCookie ? sessionCookie.split(';')[0] : '';
}

describe('Admin auth — /admin', () => {
  it('returns 401 when no session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when session cookie is invalid', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie: 'jc_admin_session=invalid-session-id' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 when valid session exists', async () => {
    const sessionCookie = await loginAsAdmin();
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('returns 200 with valid Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('returns 401 with invalid Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin',
      headers: { authorization: 'Bearer wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Admin auth — /admin/api/*', () => {
  it('returns 401 without session cookie', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/api/config' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 with invalid session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/config',
      headers: { cookie: 'jc_admin_session=invalid-session-id' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 with valid session', async () => {
    const sessionCookie = await loginAsAdmin();
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/config',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.routing).toBeDefined();
  });

  it('returns 200 with valid Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/config',
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.routing).toBeDefined();
  });

  it('returns 401 with invalid Bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/config',
      headers: { authorization: 'Bearer wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not accept API key as admin session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/config',
      headers: { cookie: `jc_admin_session=${API_KEY}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('does not accept API key as Bearer token for admin', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/admin/api/config',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Admin key does not access normal API routes', () => {
  it('returns 401 on /v1/models with admin key (not in apiKeys)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: `Bearer ${ADMIN_KEY}` },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('Normal API auth continues to work', () => {
  it('returns 200 on /v1/models with valid API key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.object).toBe('list');
  });

  it('returns 401 on /v1/models with invalid API key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/models',
      headers: { authorization: 'Bearer bad-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 on /v1/models with no auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/models' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 on /health with no auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});

describe('Login and logout', () => {
  it('returns 401 for invalid admin key on login', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/login',
      payload: { adminKey: 'wrong-key' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 and sets cookie for valid admin key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/login',
      payload: { adminKey: ADMIN_KEY },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ok).toBe(true);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('jc_admin_session=');
  });

  it('clears session cookie on logout', async () => {
    const sessionCookie = await loginAsAdmin();
    const res = await app.inject({
      method: 'POST',
      url: '/admin/api/logout',
      headers: { cookie: sessionCookie },
    });
    expect(res.statusCode).toBe(200);
    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toContain('Max-Age=0');
  });
});