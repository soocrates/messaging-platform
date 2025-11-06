const sessions = new Map();

/**
 * Session shape:
 * {
 *   sessionId: string,
 *   token: string | null,
 *   ws?: WebSocket,
 *   rate: { tokens: number, lastRefillMs: number }
 * }
 */

const TOKENS_PER_MINUTE = 30;
const BURST_TOKENS = 60;

export function getOrCreateSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sessionId,
      token: null,
      ws: null,
      rate: { tokens: BURST_TOKENS, lastRefillMs: Date.now() }
    });
  }
  return sessions.get(sessionId);
}

export function attachSocketToSession(sessionId, ws) {
  const s = getOrCreateSession(sessionId);
  s.ws = ws;
  return s;
}

export function setSessionToken(sessionId, token) {
  const s = getOrCreateSession(sessionId);
  s.token = token;
}

export function getSession(sessionId) {
  return sessions.get(sessionId);
}

export function removeSession(sessionId) {
  const s = sessions.get(sessionId);
  if (s?.ws) {
    try { s.ws.terminate(); } catch {}
  }
  sessions.delete(sessionId);
}

export function allowMessage(sessionId) {
  const s = getSession(sessionId);
  if (!s) return false;
  const now = Date.now();
  // refill
  const minutes = (now - s.rate.lastRefillMs) / 60000;
  if (minutes > 0) {
    s.rate.tokens = Math.min(BURST_TOKENS, s.rate.tokens + minutes * TOKENS_PER_MINUTE);
    s.rate.lastRefillMs = now;
  }
  if (s.rate.tokens >= 1) {
    s.rate.tokens -= 1;
    return true;
  }
  return false;
}

