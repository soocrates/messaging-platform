import crypto from 'crypto';

const secret = process.env.SESSION_HMAC_SECRET || '';

export function signSession(sessionId) {
  if (!secret) return '';
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(String(sessionId));
  return hmac.digest('hex');
}

export function verifySessionSignature(sessionId, signature) {
  if (!secret || !signature) return false;
  try {
    const expected = signSession(sessionId);
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature));
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isOriginAllowed(originHeader) {
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true; // if none set, allow any (dev)
  if (!originHeader) return false;
  return allowed.includes(originHeader);
}

