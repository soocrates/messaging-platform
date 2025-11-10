import { v4 as uuidv4 } from 'uuid';
import { heartbeat } from './heartbeat.js';
import { isOriginAllowed, signSession, verifySessionSignature } from '../../utils/security.js';
import { verifyCognitoIdToken, requireAuthEnabled } from '../../utils/auth.js';
import { 
  getOrCreateSession, 
  attachSocketToSession, 
  getSession, 
  removeSession, 
  setSessionToken, 
  allowMessage 
} from '../../modules/sessionManager.js';
import { saveMessage, getHistoryForSession } from '../../modules/db/index.js';
import { generateBotResponse } from '../../modules/aws/lexConnect.js';
import { messageSchema } from '../validators/message.validator.js';
import { logger } from '../../utils/logger.js';

export async function handleConnection(ws, req) {
  try {
    // Origin check
    const origin = req.headers.origin || '';
    if (!isOriginAllowed(origin)) {
      logger.warn('Connection refused - origin not allowed', { 
        origin, 
        remoteAddress: req.socket.remoteAddress 
      });
      ws.close(1008, 'Origin not allowed');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    const url = new URL(req.url, `http://${req.headers.host}`);
    let sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');
    const idToken = url.searchParams.get('idToken');

    // Extract user email from token
    let userEmail = 'anonymous@system.local'; // Default for unauthenticated
    let cognitoPayload = null;

    if (requireAuthEnabled()) {
      try {
        cognitoPayload = await verifyCognitoIdToken(idToken || '');
        userEmail = cognitoPayload.email || cognitoPayload['cognito:username'] || cognitoPayload.sub;
        logger.info('User authenticated', { email: userEmail });
      } catch (e) {
        logger.warn('Connection refused - authentication failed', { 
          error: e.message, 
          hasIdToken: !!idToken 
        });
        ws.close(1008, 'Authentication required');
        return;
      }
    } 

    // New session if no sessionId provided
    if (!sessionId) {
      sessionId = uuidv4();
      const sig = signSession(sessionId);
      setSessionToken(sessionId, sig);
    } else {
      // If sessionId provided, verify token
      if (!verifySessionSignature(sessionId, token)) {
        logger.warn('Connection refused - invalid session token', { sessionId });
        ws.close(1008, 'Invalid session token');
        return;
      }
    }

    getOrCreateSession(sessionId);
    attachSocketToSession(sessionId, ws);
    logger.info('Client connected', { sessionId });

    // Storing user email in WebSocket object
    ws.userEmail = userEmail;
    ws.sessionId = sessionId;

    // Send hello + session ID/token and initial history
    (async () => {
      const sig = signSession(sessionId);
      setSessionToken(sessionId, sig);
      ws.send(JSON.stringify({ type: 'session', sessionId, token: sig, userEmail }));
      const history = await getHistoryForSession(sessionId, 200);
      ws.send(JSON.stringify({ type: 'history', sessionId, history }));
    })().catch((err) => logger.error('Initial history send error', { error: err.message }));

    ws.on('message', (raw) => handleMessage(ws, raw, sessionId, userEmail));
    ws.on('close', () => handleClose(sessionId, userEmail));
    ws.on('error', (err) => handleError(err, sessionId, userEmail));
  } catch (err) {
    logger.error('Connection error', { error: err.message });
    try {
      ws.send(JSON.stringify({ type: 'error', message: 'Connection initialization failed' }));
    } catch {}
    ws.close();
  }
}

async function handleMessage(ws, raw, sessionId, userEmail) {
  let msg;
  try {
    // Quick size guard
    if (typeof raw?.length === 'number' && raw.length > 256 * 1024) {
      ws.send(JSON.stringify({ type: 'error', message: 'Payload too large' }));
      return;
    }
    msg = JSON.parse(raw.toString());
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    return;
  }

  const { error } = messageSchema.validate(msg, { stripUnknown: true });
  if (error) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message schema' }));
    return;
  }

  if (!allowMessage(sessionId)) {
    ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
    return;
  }

  const now = Date.now();

  if (msg.type === 'message') {
    const content = String(msg.content || '').trim();
    const userMessage = { sessionId, sender: userEmail, content, timestamp: now };

    try {
      await saveMessage(userMessage);
      ws.send(JSON.stringify({ type: 'message', ...userMessage }));

      const botText = await generateBotResponse(content, sessionId);
      const botMessage = { 
        sessionId, 
        sender: 'bot', 
        content: botText, 
        timestamp: Date.now() 
      };
      await saveMessage(botMessage);

      const s = getSession(sessionId);
      if (s?.ws && s.ws.readyState === s.ws.OPEN) {
        s.ws.send(JSON.stringify({ type: 'message', ...botMessage }));
      }
    } catch (err) {
      logger.error('Message handling error', { sessionId,userEmail, error: err.message });
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
    }
  } else if (msg.type === 'ping') {
    ws.send(JSON.stringify({ type: 'pong', ts: now }));
  }
}

function handleClose(sessionId) {
  logger.info('Client disconnected', { sessionId, userEmail });
  removeSession(sessionId);
}

function handleError(err, sessionId) {
  logger.error('WebSocket error', { sessionId,userEmail, error: err.message });
}