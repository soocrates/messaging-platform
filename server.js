import 'dotenv/config';
import http from 'http';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

import { setupSecurity } from './backend/config/security.js';
import { setupMiddleware } from './backend/config/index.js';
import routes from './backend/routes/index.js';
import { initWebSocketServer } from './backend/websocket/index.js';
import { runStartupChecks } from './backend/startup/checks.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();

// Security setup
setupSecurity(app);

// Middleware setup
setupMiddleware(app, __dirname);

// Routes
app.use('/', routes);

// Create HTTP server
const server = http.createServer(app);

// Initialize WebSocket server
const wss = initWebSocketServer(server);

// Export for use in other modules
export { wss };

// Run startup checks then start server
runStartupChecks().finally(() => {
  server.listen(PORT, HOST, () => {
    logger.info('Server listening', { host: HOST, port: PORT });
  });
});