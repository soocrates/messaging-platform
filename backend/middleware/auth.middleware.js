import { verifySessionSignature } from '../../utils/security.js';
import { verifyCognitoIdToken, requireAuthEnabled } from '../../utils/auth.js';

export async function validateSession(req, res, next) {
  const { sessionId } = req.params;
  const sessToken = req.headers['x-session-token'] || '';
  const sessIdHeader = req.headers['x-session-id'] || '';
  
  // Validate session token
  if (!sessToken || !sessIdHeader || String(sessIdHeader) !== sessionId || 
      !verifySessionSignature(sessionId, String(sessToken))) {
    res.status(401).json({ error: 'Invalid or missing session token' });
    return;
  }
  
  // Validate Cognito token if auth is enabled
  if (requireAuthEnabled()) {
    const auth = req.headers.authorization || '';
    const parts = auth.split(' ');
    
    if (parts[0] !== 'Bearer' || !parts[1]) {
      res.status(401).json({ error: 'Missing Authorization' });
      return;
    }
    
    try {
      await verifyCognitoIdToken(parts[1]);
    } catch (e) {
      res.status(401).json({ error: 'Invalid token' });
      return;
    }
  }
  
  next();
}