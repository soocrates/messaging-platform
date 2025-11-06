import { createRemoteJWKSet, jwtVerify } from 'jose';

let jwks;

function getJwksUrl() {
  const poolId = process.env.COGNITO_USER_POOL_ID || '';
  const region = process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1';
  if (!poolId) return '';
  return `https://cognito-idp.${region}.amazonaws.com/${poolId}/.well-known/jwks.json`;
}

export async function verifyCognitoIdToken(idToken) {
  if (!idToken) throw new Error('Missing token');
  const aud = process.env.COGNITO_CLIENT_ID || '';
  const jwksUrl = process.env.COGNITO_JWKS_URL || getJwksUrl();
  if (!jwksUrl) throw new Error('Missing JWKS url configuration');
  if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl));

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: [`https://cognito-idp.${(process.env.COGNITO_REGION || process.env.AWS_REGION || 'us-east-1')}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`],
    audience: aud ? [aud] : undefined
  });

  if (payload.token_use && payload.token_use !== 'id') {
    throw new Error('Invalid token_use');
  }
  return payload; // contains sub, email, etc.
}

export function requireAuthEnabled() {
  return String(process.env.REQUIRE_AUTH || '').toLowerCase() === 'true';
}

