import 'dotenv/config';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import Joi from 'joi';

import { getOrCreateSession, attachSocketToSession, getSession, removeSession, setSessionToken, allowMessage } from './modules/sessionManager.js';
import { saveMessage, getHistoryForSession } from './modules/db/index.js';
import { generateBotResponse } from './modules/aws/lexConnect.js';
import { logger } from './utils/logger.js';
import { signSession, verifySessionSignature, isOriginAllowed } from './utils/security.js';
import { verifyCognitoIdToken, requireAuthEnabled } from './utils/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      connectSrc: ["'self'", 'ws:', 'wss:']
    }
  }
}));
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: true, limit: '64kb' }));

// Serve demo frontend
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// Rate limit for REST endpoints
const restLimiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });
app.use('/history/', restLimiter);

// Fetch chat history
app.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length > 100) {
      res.status(400).json({ error: 'Invalid sessionId' });
      return;
    }
    // Require session token for history calls
    const sessToken = req.headers['x-session-token'] || '';
    const sessIdHeader = req.headers['x-session-id'] || '';
    if (!sessToken || !sessIdHeader || String(sessIdHeader) !== sessionId || !verifySessionSignature(sessionId, String(sessToken))) {
      res.status(401).json({ error: 'Invalid or missing session token' });
      return;
    }
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
    const history = await getHistoryForSession(sessionId, 200);
    res.json({ sessionId, history });
  } catch (err) {
    logger.error('History fetch failed', { error: err.message });
    res.status(500).json({ error: 'Failed to retrieve history' });
  }
});

const server = http.createServer(app);

// WebSocket server with payload cap
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

// Heartbeat handling
function heartbeat() { this.isAlive = true; }
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(); } catch {}
  });
}, 30_000);

wss.on('close', () => clearInterval(pingInterval));

const messageSchema = Joi.object({
  type: Joi.string().valid('message', 'ping').required(),
  content: Joi.when('type', { is: 'message', then: Joi.string().min(1).max(2000).required(), otherwise: Joi.forbidden() })
});

wss.on('connection', (ws, req) => {
  try {
    // Origin check
    const origin = req.headers.origin || '';
    if (!isOriginAllowed(origin)) {
      ws.close(1008, 'Origin not allowed');
      return;
    }

    ws.isAlive = true;
    ws.on('pong', heartbeat);

    const url = new URL(req.url, `http://${req.headers.host}`);
    let sessionId = url.searchParams.get('sessionId');
    const token = url.searchParams.get('token');
    const idToken = url.searchParams.get('idToken');

    // Optionally require Cognito auth
    if (requireAuthEnabled()) {
      try {
        await verifyCognitoIdToken(idToken || '');
      } catch (e) {
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
        ws.close(1008, 'Invalid session token');
        return;
      }
    }

    getOrCreateSession(sessionId);
    attachSocketToSession(sessionId, ws);
    logger.info('Client connected', { sessionId });

    // Send hello + session ID/token and initial history
    (async () => {
      const sig = signSession(sessionId);
      setSessionToken(sessionId, sig);
      ws.send(JSON.stringify({ type: 'session', sessionId, token: sig }));
      const history = await getHistoryForSession(sessionId, 200);
      ws.send(JSON.stringify({ type: 'history', sessionId, history }));
    })().catch((err) => logger.error('Initial history send error', { error: err.message }));

    ws.on('message', async (raw) => {
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
        const userMessage = { sessionId, sender: 'user', content, timestamp: now };

        try {
          await saveMessage(userMessage);
          ws.send(JSON.stringify({ type: 'message', ...userMessage }));

          const botText = await generateBotResponse(content, sessionId);
          const botMessage = { sessionId, sender: 'bot', content: botText, timestamp: Date.now() };
          await saveMessage(botMessage);

          const s = getSession(sessionId);
          if (s?.ws && s.ws.readyState === s.ws.OPEN) {
            s.ws.send(JSON.stringify({ type: 'message', ...botMessage }));
          }
        } catch (err) {
          logger.error('Message handling error', { sessionId, error: err.message });
          ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }));
        }
      } else if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: now }));
      }
    });

    ws.on('close', () => {
      logger.info('Client disconnected', { sessionId });
      removeSession(sessionId);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket error', { sessionId, error: err.message });
    });
  } catch (err) {
    logger.error('Connection error', { error: err.message });
    try {
      ws.send(JSON.stringify({ type: 'error', message: 'Connection initialization failed' }));
    } catch {}
    ws.close();
  }
});

server.listen(PORT, HOST, () => {
  logger.info('Server listening', { host: HOST, port: PORT });
});

