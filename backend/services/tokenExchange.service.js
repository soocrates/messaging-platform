import fetch from 'node-fetch';
import { config } from '../config/index.js';
import { logger } from '../../utils/logger.js';

export async function exchangeCodeForTokens(code) {
  try {
    const tokenEndpoint = config.cognito.tokenEndpoint || 
      `https://us-east-149cptz69g.auth.us-east-1.amazoncognito.com/oauth2/token`;
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.cognito.clientId,
      code: code,
      redirect_uri: 'http://localhost:8080/'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });

    const data = await response.json();
    
    if (!response.ok) {
      logger.error('Token exchange failed', { error: data });
      return null;
    }

    return data;
  } catch (err) {
    logger.error('Token exchange service error', { error: err.message });
    return null;
  }
}