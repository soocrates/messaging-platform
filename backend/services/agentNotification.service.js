let wss = null;

// Initialize with WebSocket server instance
export function initAgentNotificationService(websocketServer) {
  wss = websocketServer;
}

// Notify all connected agents
export function notifyAgents(notification) {
  if (!wss) {
    console.warn('WebSocket server not initialized for agent notifications');
    return;
  }

  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN && client.isAgent) {
      client.send(JSON.stringify({
        type: 'agent_notification',
        notification
      }));
    }
  });
}