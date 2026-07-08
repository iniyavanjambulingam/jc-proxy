import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getConfig, updateConfig } from '../config.js';
import { registry } from '../router.js';
import { DASHBOARD_HTML, LOGIN_HTML } from '../dashboard.js';
import { logService } from '../services/logService.js';
import { healthService } from '../services/healthService.js';
import { adminAuth } from '../adminAuth.js';
import { createSession, destroySession, generateSessionCookie, validateSession, getSessionCookieName } from '../sessionManager.js';


const FallbackChainsSchema = z.record(z.string(), z.array(z.string()));

function validateFallbackChains(chains: Record<string, string[]>): string[] {
  const errors: string[] = [];

  for (const [primary, fallbacks] of Object.entries(chains)) {
    if (!primary.trim()) {
      errors.push('Empty primary model name');
      continue;
    }
    if (fallbacks.length === 0) {
      errors.push(`Chain for "${primary}" has no fallback models`);
    }
    const seen = new Set<string>();
    for (const model of fallbacks) {
      if (!model.trim()) {
        errors.push(`Empty model name in chain for "${primary}"`);
      } else if (seen.has(model)) {
        errors.push(`Duplicate model "${model}" in chain for "${primary}"`);
      } else {
        seen.add(model);
      }
    }
  }

  // Check circular references via DFS
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function dfs(node: string, path: string[]): boolean {
    if (visited.has(node)) return false;
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      errors.push(`Circular reference: ${cycle.map(m => `"${m}"`).join(' -> ')}`);
      return true;
    }
    visiting.add(node);
    path.push(node);
    for (const next of chains[node] || []) {
      dfs(next, path);
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return false;
  }

  for (const node of Object.keys(chains)) {
    dfs(node, []);
  }

  return errors;
}

export async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for login endpoint and static dashboard
    if (request.url === '/admin/api/login') return;
    if (request.url === '/admin' && request.method === 'GET') return;
    if (request.url.startsWith('/admin/api/')) {
      await adminAuth(request, reply);
    }
  });

  app.post('/admin/api/login', async (req, reply) => {
    const { adminKey } = req.body as { adminKey?: string };
    const { security } = getConfig();

    if (!security.adminKey || adminKey !== security.adminKey) {
      return reply.status(401).send({ error: 'Invalid admin key' });
    }

    const sessionId = createSession();
    const cookie = generateSessionCookie(sessionId);
    reply.header('Set-Cookie', cookie);
    return { ok: true };
  });

  app.post('/admin/api/logout', async (req, reply) => {
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('=').map(s => s.trim()))
    );
    const sessionId = cookies[getSessionCookieName()];
    if (sessionId) {
      destroySession(sessionId);
    }
    const expiredCookie = `${getSessionCookieName()}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
    reply.header('Set-Cookie', expiredCookie);
    return { ok: true };
  });

  app.get('/admin', async (req, reply) => {
    // Check session cookie
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(
      cookieHeader.split(';').map(c => c.trim().split('=').map(s => s.trim()))
    );
    const sessionId = cookies[getSessionCookieName()];

    if (sessionId && validateSession(sessionId)) {
      reply.type('text/html').send(DASHBOARD_HTML);
      return;
    }

    // Fallback: check Bearer token
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const { security } = getConfig();
      if (security.adminKey && token === security.adminKey) {
        reply.type('text/html').send(DASHBOARD_HTML);
        return;
      }
    }

    reply.code(401).type('text/html').send(LOGIN_HTML);
  });

  app.get('/admin/api/config', async () => {
    const cfg = getConfig();
    const ws = cfg.webSearch || {};
    return {
      listen: cfg.listen,
      apiKeys: cfg.security.apiKeys,
      routing: {
        mode: cfg.routing.mode,
        providers: cfg.routing.providers.map(p => ({
          ...p,
          apiKey: p.apiKey ? '***' + p.apiKey.slice(-4) : '',
          accountId: p.accountId ? '***' + p.accountId.slice(-4) : '',
        })),
      },
      aliases: cfg.aliases || {},
      fallbackChains: cfg.fallbackChains || {},
      claudeCode: cfg.claudeCode || { enabled: false, target: '', fallbacks: [] },
      webSearch: {
        tavilyApiKey: ws.tavilyApiKey ? '***' + ws.tavilyApiKey.slice(-4) : '',
        braveApiKey: ws.braveApiKey ? '***' + ws.braveApiKey.slice(-4) : '',
        searxngUrl: ws.searxngUrl || '',
      },
    };
  });

  app.put('/admin/api/config/websearch', async (req) => {
    const body = req.body as { tavilyApiKey?: string; braveApiKey?: string; searxngUrl?: string };
    updateConfig(cfg => {
      const prev = cfg.webSearch || {};
      cfg.webSearch = {
        tavilyApiKey: body.tavilyApiKey?.startsWith('***') ? prev.tavilyApiKey : (body.tavilyApiKey || undefined),
        braveApiKey: body.braveApiKey?.startsWith('***') ? prev.braveApiKey : (body.braveApiKey || undefined),
        searxngUrl: body.searxngUrl || undefined,
      };
    });
    return { ok: true };
  });

  app.put('/admin/api/claude-code', async (req) => {
    const body = req.body as { enabled?: boolean; target?: string; fallbacks?: string[] };
    updateConfig(cfg => {
      cfg.claudeCode = {
        enabled: body.enabled ?? false,
        target: body.target || '',
        fallbacks: body.fallbacks || [],
      };
    });
    return { ok: true };
  });

  app.post('/admin/api/providers', async (req) => {
    const body = req.body as any;
    logService.add({ level: 'info', requestId: '', provider: body.id || '', model: '', endpoint: '/admin/api/providers', statusCode: 0, latencyMs: 0, message: `added provider ${body.id}` });
    updateConfig(cfg => {
      cfg.routing.providers.push(body);
    });
    await registry.init(getConfig());
    return { ok: true };
  });

  app.put('/admin/api/providers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const body = req.body as any;
    logService.add({ level: 'info', requestId: '', provider: id, model: '', endpoint: '/admin/api/providers/:id', statusCode: 0, latencyMs: 0, message: `updated provider ${id}` });
    updateConfig(cfg => {
      const idx = cfg.routing.providers.findIndex(p => p.id === id);
      if (idx === -1) throw new Error('Provider not found');
      if (body.apiKey && body.apiKey.startsWith('***')) {
        body.apiKey = cfg.routing.providers[idx].apiKey;
      }
      if (body.accountId && body.accountId.startsWith('***')) {
        body.accountId = cfg.routing.providers[idx].accountId;
      }
      cfg.routing.providers[idx] = { ...cfg.routing.providers[idx], ...body };
    });
    await registry.init(getConfig());
    return { ok: true };
  });

  // DELETE by index to safely handle multiple channels with the same provider type id
  app.delete('/admin/api/providers/:id', async (req) => {
    const { id } = req.params as { id: string };
    const idxParam = (req.query as any).index;
    logService.add({ level: 'info', requestId: '', provider: id, model: '', endpoint: '/admin/api/providers/:id', statusCode: 0, latencyMs: 0, message: `deleted provider ${id}` });
    updateConfig(cfg => {
      if (idxParam !== undefined) {
        // Delete by exact index (preferred — safe for duplicate IDs)
        const idx = parseInt(idxParam, 10);
        if (!isNaN(idx) && idx >= 0 && idx < cfg.routing.providers.length) {
          cfg.routing.providers.splice(idx, 1);
        }
      } else {
        // Fallback: remove only the FIRST matching provider by id
        const idx = cfg.routing.providers.findIndex(p => p.id === id);
        if (idx !== -1) cfg.routing.providers.splice(idx, 1);
      }
    });
    await registry.init(getConfig());
    return { ok: true };
  });

  app.put('/admin/api/routing', async (req) => {
    const body = req.body as any;
    logService.add({ level: 'info', requestId: '', provider: '', model: '', endpoint: '/admin/api/routing', statusCode: 0, latencyMs: 0, message: `changed routing mode to ${body.mode}` });
    updateConfig(cfg => {
      if (body.mode) cfg.routing.mode = body.mode;
    });
    return { ok: true };
  });

  app.post('/admin/api/keys', async (req) => {
    const body = req.body as { key: string; allowedModels?: string[] };
    logService.add({ level: 'info', requestId: '', provider: '', model: '', endpoint: '/admin/api/keys', statusCode: 0, latencyMs: 0, message: `added/updated api key` });
    updateConfig(cfg => {
      const idx = cfg.security.apiKeys.findIndex(k => k.key === body.key);
      if (idx === -1) {
        cfg.security.apiKeys.push({ key: body.key, allowedModels: body.allowedModels || [] });
      } else {
        cfg.security.apiKeys[idx].allowedModels = body.allowedModels || [];
      }
    });
    return { ok: true };
  });

  app.delete('/admin/api/keys/:key', async (req) => {
    const { key } = req.params as { key: string };
    logService.add({ level: 'info', requestId: '', provider: '', model: '', endpoint: '/admin/api/keys/:key', statusCode: 0, latencyMs: 0, message: `deleted api key` });
    updateConfig(cfg => {
      cfg.security.apiKeys = cfg.security.apiKeys.filter(k => k.key !== key);
    });
    return { ok: true };
  });

  app.get('/admin/api/models', async () => {
    const { listAllModels } = await import('../router.js');
    const models = await listAllModels();
    return { models };
  });

  app.put('/admin/api/aliases', async (req) => {
    const aliases = req.body as Record<string, string[]>;
    updateConfig(cfg => {
      cfg.aliases = aliases;
    });
    return { ok: true };
  });

  app.get('/admin/api/health', async () => {
    return healthService.summary();
  });

  app.get('/admin/api/providers/:id/models', async (req) => {
    const { id } = req.params as { id: string };
    const models = registry.getRawDiscoveredModels(id);
    return { models };
  });

  app.get('/admin/api/providers/:id/capabilities', async (req) => {
    const { id } = req.params as { id: string };
    const caps = registry.getCapabilities(id);
    return { capabilities: caps };
  });

  app.post('/admin/api/providers/:id/refresh-models', async (req) => {
    const { id } = req.params as { id: string };
    logService.add({ level: 'info', requestId: '', provider: id, model: '', endpoint: '/admin/api/providers/:id/refresh-models', statusCode: 0, latencyMs: 0, message: `refreshed models for ${id}` });
    const models = await registry.refreshModels(id);
    return { models };
  });

  app.get('/admin/api/logs', async (req) => {
    const limit = (req.query as any).limit ? parseInt((req.query as any).limit, 10) : undefined;
    return { logs: logService.getRecent(limit) };
  });

  app.delete('/admin/api/logs', async () => {
    logService.clear();
    return { ok: true };
  });

  app.get('/admin/api/logs/stats', async () => {
    return logService.stats();
  });

  app.get('/admin/api/fallbacks', async () => {
    return { fallbackChains: getConfig().fallbackChains || {} };
  });

  app.put('/admin/api/fallbacks', async (req, reply) => {
    const result = FallbackChainsSchema.safeParse(req.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.message });
    }
    const errors = validateFallbackChains(result.data);
    if (errors.length > 0) {
      return reply.status(400).send({ error: errors.join('; ') });
    }
    logService.add({ level: 'info', requestId: '', provider: '', model: '', endpoint: '/admin/api/fallbacks', statusCode: 0, latencyMs: 0, message: 'updated fallback chains' });
    updateConfig(cfg => {
      cfg.fallbackChains = result.data;
    });
    return { ok: true };
  });
}
