import 'dotenv/config';
import http from 'http';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import Joi from 'joi';

import { getOrCreateSession, attachSocketToSession, getSession, removeSession, setSessionToken, allowMessage } from './modules/sessionManager.js';
import { saveMessage, getHistoryForSession } from './modules/db/index.js';
import { createSupportCase, updateCaseStatus, getCasesByStatus } from './modules/db/supportCases.js';
import { generateBotResponse } from './modules/aws/lexConnect.js';
import { logger } from './utils/logger.js';
import { signSession, verifySessionSignature, isOriginAllowed } from './utils/security.js';
import { verifyCognitoIdToken, requireAuthEnabled } from './utils/auth.js';
import pg from 'pg';

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
app.use('/api/support/', restLimiter);
app.use('/api/agents/', restLimiter);

// Agent availability tracking (in-memory for now)
const agentSessions = new Map(); // agentId -> { lastSeen, status }

// Get online agents count
app.get('/api/agents/online', (_req, res) => {
  const now = Date.now();
  const timeout = 60_000; // 1 minute
  let onlineCount = 0;
  
  agentSessions.forEach((agent, agentId) => {
    if (now - agent.lastSeen < timeout && agent.status === 'online') {
      onlineCount++;
    }
  });
  
  // For demo, return a minimum of 3 agents (simulated)
  const count = Math.max(onlineCount, 3);
  res.json({ count, available: true, message: '24/7 Support Available' });
});

// Get contextual questions based on user history
app.post('/api/support/questions', async (req, res) => {
  try {
    const { contactMethod, userSessionId } = req.body;
    
    if (!contactMethod || !['chat', 'email', 'call'].includes(contactMethod)) {
      res.status(400).json({ error: 'Invalid contact method' });
      return;
    }

    const questions = [];

    // If user has previous session, analyze their history
    if (userSessionId) {
      try {
        const history = await getHistoryForSession(userSessionId, 50);
        
        // Analyze previous conversations
        const recentMessages = history.slice(-10);
        const userMessages = recentMessages.filter(m => m.sender === 'user');
        const mentionedServices = new Set();
        const mentionedIssues = [];

        userMessages.forEach(msg => {
          const content = msg.content.toLowerCase();
          // Extract service mentions
          if (content.includes('ec2') || content.includes('s3') || content.includes('lambda') || 
              content.includes('rds') || content.includes('dynamodb')) {
            if (content.includes('ec2')) mentionedServices.add('EC2');
            if (content.includes('s3')) mentionedServices.add('S3');
            if (content.includes('lambda')) mentionedServices.add('Lambda');
            if (content.includes('rds')) mentionedServices.add('RDS');
            if (content.includes('dynamodb')) mentionedServices.add('DynamoDB');
          }
          // Extract issue types
          if (content.includes('error') || content.includes('issue') || content.includes('problem')) {
            mentionedIssues.push(msg.content);
          }
        });

        // Generate contextual questions based on history
        if (mentionedServices.size > 0) {
          const services = Array.from(mentionedServices).join(', ');
          questions.push(`I see you've been working with ${services}. What specific issue are you experiencing?`);
        } else if (userMessages.length > 0) {
          questions.push('Based on your previous conversations, how can we help you today?');
        }

        if (mentionedIssues.length > 0) {
          questions.push('Is this related to the issue you mentioned earlier?');
        }

        // Check for recent support cases
        const recentCases = await getCasesByStatus('open');
        const userCases = recentCases.filter(c => c.user_session_id === userSessionId);
        
        if (userCases.length > 0) {
          questions.push(`I notice you have ${userCases.length} open case(s). Is this related to any of them?`);
        }
      } catch (err) {
        logger.error('Failed to analyze user history', { error: err.message });
      }
    }

    // Add default questions if no contextual questions generated
    if (questions.length === 0) {
      if (contactMethod === 'chat') {
        questions.push('How can we help you today?');
        questions.push('What service or feature are you having issues with?');
        questions.push('Can you describe the problem in more detail?');
      } else {
        questions.push('What can we help you with?');
      }
    } else {
      // Add follow-up questions
      questions.push('Can you provide more details about your issue?');
    }

    res.json({ 
      success: true, 
      questions,
      contactMethod 
    });
  } catch (err) {
    logger.error('Failed to generate questions', { error: err.message });
    // Return default questions on error
    const defaultQuestions = req.body.contactMethod === 'chat' 
      ? ['How can we help you today?', 'What service are you having issues with?']
      : ['What can we help you with?'];
    res.json({ success: true, questions: defaultQuestions, contactMethod: req.body.contactMethod });
  }
});

// Validate Cognito ID token (used by demo UI)
app.post('/api/auth/validate', async (req, res) => {
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
});

// Exchange authorization code for tokens
app.post('/api/auth/token', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ success: false, error: 'Missing authorization code' });
      return;
    }

    const tokenEndpoint = `https://us-east-149cptz69g.auth.us-east-1.amazoncognito.com/oauth2/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: process.env.COGNITO_CLIENT_ID,
      code: code,
      redirect_uri: 'http://localhost:8080'
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
      res.status(400).json({ success: false, error: 'Token exchange failed' });
      return;
    }

    res.json({
      success: true,
      idToken: data.id_token,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in
    });
  } catch (err) {
    logger.error('Token exchange error', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

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

// Startup checks (Postgres connectivity and config logging)
async function runStartupChecks() {
  try {
    logger.info('Startup configuration', {
      requireAuth: requireAuthEnabled(),
      cognitoPool: process.env.COGNITO_USER_POOL_ID ? 'configured' : 'missing',
      cognitoRegion: process.env.COGNITO_REGION || process.env.AWS_REGION || 'unset',
      dynamoTable: process.env.DYNAMO_TABLE || 'unset',
      dynamoEndpoint: process.env.DYNAMO_ENDPOINT ? 'custom' : 'default',
      pgHost: process.env.PGHOST || 'unset',
      pgDatabase: process.env.PGDATABASE || 'unset'
    });

    // Test Postgres connection
    const { Pool } = pg;
    const pool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'chatdb',
      user: process.env.PGUSER || 'chatuser',
      password: process.env.PGPASSWORD || '',
      ssl: process.env.PGSSL === 'true'
    });
    try {
      await pool.query('SELECT 1');
      logger.info('Postgres connectivity check passed');
    } catch (err) {
      logger.error('Postgres connectivity check failed', { error: err.message });
    } finally {
      await pool.end();
    }
  } catch (err) {
    logger.error('Startup checks failed', { error: err.message });
  }
}

// WebSocket server with payload cap
const wss = new WebSocketServer({ server, maxPayload: 256 * 1024 });

// Helper function to notify agents
function notifyAgents(notification) {
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN && client.isAgent) {
      client.send(JSON.stringify({
        type: 'agent_notification',
        notification
      }));
    }
  });
}

// Support case validation schema
const supportCaseSchema = Joi.object({
  helpType: Joi.string().valid('technical', 'account', 'other').required(),
  service: Joi.string().min(1).max(200).required(),
  category: Joi.string().min(1).max(200).required(),
  severity: Joi.string().valid('low', 'medium', 'high').required(),
  subject: Joi.string().min(1).max(500).required(),
  description: Joi.string().min(1).max(5000).required(),
  contactMethod: Joi.string().valid('chat', 'email', 'call').required(),
  userSessionId: Joi.string().optional()
});

// Submit support case
app.post('/api/support/cases', async (req, res) => {
  try {
    const { error, value } = supportCaseSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      res.status(400).json({ error: error.details[0].message });
      return;
    }

    const caseData = await createSupportCase(value);
    
    // Notify agents based on contact method
    if (value.contactMethod === 'call' || value.contactMethod === 'email') {
      notifyAgents({
        type: value.contactMethod,
        caseId: caseData.case_id,
        subject: value.subject,
        severity: value.severity,
        timestamp: Date.now()
      });
      logger.info('Agent notification sent', { caseId: caseData.case_id, method: value.contactMethod });
    }

    res.status(201).json({
      success: true,
      caseId: caseData.case_id,
      message: 'Support case created successfully',
      contactMethod: value.contactMethod
    });
  } catch (err) {
    logger.error('Support case creation failed', { error: err.message });
    res.status(500).json({ error: 'Failed to create support case' });
  }
});

// Pause support case
app.post('/api/support/cases/:caseId/pause', async (req, res) => {
  try {
    const { caseId } = req.params;
    const updated = await updateCaseStatus(caseId, 'paused');
    if (!updated) {
      res.status(404).json({ error: 'Case not found' });
      return;
    }
    res.json({ success: true, caseId, status: 'paused' });
  } catch (err) {
    logger.error('Case pause failed', { error: err.message });
    res.status(500).json({ error: 'Failed to pause case' });
  }
});

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

wss.on('connection', async (ws, req) => {
  try {
    // Origin check
    const origin = req.headers.origin || '';
    if (!isOriginAllowed(origin)) {
      logger.warn('Connection refused - origin not allowed', { origin, remoteAddress: req.socket.remoteAddress });
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
        logger.warn('Connection refused - authentication failed', { error: e.message, hasIdToken: !!idToken });
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

// Run startup checks then start server
runStartupChecks().finally(() => {
  server.listen(PORT, HOST, () => {
    logger.info('Server listening', { host: HOST, port: PORT });
  });
});

