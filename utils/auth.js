import { createRemoteJWKSet, jwtVerify, errors as joseErrors } from 'jose';
import { logger } from './logger.js';

let jwks;

function getJwksUrl() {
  const poolId = process.env.COGNITO_USER_POOL_ID || '';
  const region = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
  if (!poolId) return '';
  return `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`;
}

/**
 * Verify a Cognito JWT (id_token or access_token).
 * Throws an Error with a clear message on failure.
 */
export async function verifyCognitoIdToken(idToken) {
  if (!idToken) throw new Error('Missing token');

  const aud = process.env.COGNITO_CLIENT_ID || '';
  const jwksUrl = process.env.COGNITO_JWKS_URL || getJwksUrl();
  if (!jwksUrl) throw new Error('Missing JWKS url configuration (COGNITO_USER_POOL_ID/COGNITO_JWKS_URL)');

  try {
    if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));
  } catch (e) {
    logger.error('Failed to create JWK set', { error: e.message, jwksUrl });
    throw new Error('Failed to initialize JWKS verifier');
  }

  const issuer = `https://cognito-idp.${(process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1')}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`;

  try {
    // First attempt: verify with configured audience (client id) if present
    let res;
    try {
      res = await jwtVerify(idToken, jwks, { issuer: issuer, audience: aud || undefined });
    } catch (e) {
      // If audience check failed, try again without audience (some access tokens don't use the client_id as aud)
      const msg = String(e?.message || '').toLowerCase();
      if (msg.includes('jwt audience') || msg.includes('audience')) {
        logger.warn('Audience verification failed, retrying without audience check', { error: e.message });
        res = await jwtVerify(idToken, jwks, { issuer: issuer });
      } else {
        throw e;
      }
    }

    const { payload } = res;

    // token_use check: accept both id and access tokens for this demo
    if (payload.token_use && !['id', 'access'].includes(payload.token_use)) {
      throw new Error(`Invalid token_use (${payload.token_use}). Expected 'id' or 'access' token.`);
    }

    return payload;
  } catch (err) {
    // Map common JOSE errors to friendlier messages
    if (err instanceof joseErrors.JWTExpired) {
      throw new Error('Token expired');
    }
    if (err instanceof joseErrors.JOSEError) {
      // generic JOSE error
      logger.error('Token verification JOSE error', { error: err.message });
      throw new Error(`Token verification failed: ${err.message}`);
    }
    // otherwise rethrow with message
    logger.error('Token verification error', { error: err.message });
    throw new Error(err.message || 'Token verification failed');
  }
}

export function requireAuthEnabled() {
  return String(process.env.REQUIRE_AUTH || '').toLowerCase() === 'true';
}

