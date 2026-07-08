import { FastifyRequest, FastifyReply } from 'fastify';
import { validateSession, getSessionCookieName } from './sessionManager.js';
import { getConfig } from './config.js';

export async function adminAuth(request: FastifyRequest, reply: FastifyReply) {
  // Check session cookie first
  const cookieHeader = request.headers.cookie || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map(c => c.trim().split('=').map(s => s.trim()))
  );
  const sessionId = cookies[getSessionCookieName()];

  if (sessionId && validateSession(sessionId)) {
    return;
  }

  // Fallback: check Authorization: Bearer <adminKey>
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const { security } = getConfig();
    if (security.adminKey && token === security.adminKey) {
      return;
    }
  }

  return reply.status(401).send({ error: 'Unauthorized' });
}