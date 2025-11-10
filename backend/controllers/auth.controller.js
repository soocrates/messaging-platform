import { verifyCognitoIdToken } from '../../utils/auth.js';
import { exchangeCodeForTokens } from '../services/tokenExchange.service.js';
import { logger } from '../../utils/logger.js';

export async function validateToken(req, res) {
  try {
    const { idToken } = req.body || {};
    if (!idToken) {
      res.status(400).json({ success: false, error: 'Missing idToken' });
      return;
    }
    
    try {
      const payload = await verifyCognitoIdToken(idToken);
      res.json({ success: true, payload });
    } catch (e) {
      res.status(401).json({ success: false, error: e.message });
    }
  } catch (err) {
    logger.error('Auth validation failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Validation error' });
  }
}

export async function exchangeToken(req, res) {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ success: false, error: 'Missing authorization code' });
      return;
    }

    const tokens = await exchangeCodeForTokens(code);
    
    if (!tokens) {
      res.status(400).json({ success: false, error: 'Token exchange failed' });
      return;
    }

    res.json({
      success: true,
      idToken: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in
    });
  } catch (err) {
    logger.error('Token exchange error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}