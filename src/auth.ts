import { FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from './config.js';

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  // Accept both Authorization: Bearer <key> (OpenAI style)
  // and x-api-key: <key> (Anthropic/Claude Code style)
  const authHeader = request.headers.authorization;
  const xApiKey = request.headers['x-api-key'] as string | undefined;

  let token: string | undefined;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (xApiKey) {
    token = xApiKey;
  }

  if (!token) {
    return reply.status(401).send({ error: 'Missing authorization header' });
  }

  const { security } = getConfig();
  const keyConfig = security.apiKeys.find(k => k.key === token);
  if (!keyConfig) {
    return reply.status(401).send({ error: 'Invalid API key' });
  }

  (request as any).apiKeyConfig = keyConfig;
}
