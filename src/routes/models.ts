import { FastifyInstance } from 'fastify';
import { listAllModels } from '../router.js';
import { authenticate } from '../auth.js';

export async function modelsRoutes(app: FastifyInstance) {
  app.get('/v1/models', { preHandler: authenticate }, async (request) => {
    const models = await listAllModels();
    const apiKeyConfig = (request as any).apiKeyConfig as { key: string, allowedModels?: string[] };

    if (apiKeyConfig.allowedModels && apiKeyConfig.allowedModels.length > 0) {
      const allowed = new Set(apiKeyConfig.allowedModels);
      return { object: 'list', data: models.filter(m => allowed.has(m.id)) };
    }

    return { object: 'list', data: models };
  });
}
