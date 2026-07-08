import { FastifyInstance } from 'fastify';
import { BaseProvider } from '../providers/base.js';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => {
    const healthMap = BaseProvider.healthMap;
    const providers = Object.fromEntries(healthMap);
    return { status: 'ok', providers };
  });
}
