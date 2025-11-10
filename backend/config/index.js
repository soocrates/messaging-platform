import express from 'express';
import path from 'path';

export function setupMiddleware(app, dirname) {
  // Disable x-powered-by header
  app.disable('x-powered-by');
  
  // Body parsers
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: true, limit: '64kb' }));
  
  // Serve static files
  app.use(express.static(path.join(dirname, 'public'), { 
    maxAge: '1h', 
    etag: true 
  }));
}

export const config = {
  port: process.env.PORT || 8080,
  host: process.env.HOST || '0.0.0.0',
  cognito: {
    userPoolId: process.env.COGNITO_USER_POOL_ID,
    clientId: process.env.COGNITO_CLIENT_ID,
    region: process.env.COGNITO_REGION || process.env.AWS_REGION,
    tokenEndpoint: process.env.COGNITO_TOKEN_ENDPOINT
  },
  database: {
    dynamo: {
      table: process.env.DYNAMO_TABLE,
      endpoint: process.env.DYNAMO_ENDPOINT
    },
    postgres: {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'chatdb',
      user: process.env.PGUSER || 'chatuser',
      password: process.env.PGPASSWORD || '',
      ssl: process.env.PGSSL === 'true'
    }
  },
  websocket: {
    maxPayload: 256 * 1024,
    pingInterval: 30_000,
    agentTimeout: 60_000
  },
  rateLimit: {
    windowMs: 60_000,
    maxRequests: 60
  }
};