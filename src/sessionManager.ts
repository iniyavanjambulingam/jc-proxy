import { createHmac, randomBytes } from 'crypto';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface Session {
  id: string;
  createdAt: number;
  expiresAt: number;
}

const sessions = new Map<string, Session>();

export function createSession(): string {
  const id = randomBytes(32).toString('hex');
  const now = Date.now();
  sessions.set(id, {
    id,
    createdAt: now,
    expiresAt: now + SESSION_DURATION_MS,
  });
  return id;
}

export function validateSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(sessionId);
    return false;
  }
  return true;
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
}

export function getSessionCookieName(): string {
  return 'jc_admin_session';
}

export function generateSessionCookie(sessionId: string): string {
  const parts = [
    `${getSessionCookieName()}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_DURATION_MS / 1000)}`,
  ];
  return parts.join('; ');
}

export function invalidateAllSessions(): void {
  sessions.clear();
}