import { WebSocketServer } from 'ws';
import { config } from '../config/index.js';
import { setupHeartbeat } from './heartbeat.js';
import { handleConnection } from './handlers.js';
import { initAgentNotificationService } from '../services/agentNotification.service.js';

export function initWebSocketServer(server) {
  const wss = new WebSocketServer({ 
    server, 
    maxPayload: config.websocket.maxPayload 
  });

  // Initialize agent notification service with wss instance
  initAgentNotificationService(wss);

  // Setup heartbeat mechanism
  setupHeartbeat(wss, config.websocket.pingInterval);

  // Handle new connections
  wss.on('connection', handleConnection);

  return wss;
}