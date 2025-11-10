import { config } from '../config/index.js';

// Agent availability tracking (in-memory for now)
export const agentSessions = new Map(); // agentId -> { lastSeen, status }

export function getOnlineAgents(_req, res) {
  const now = Date.now();
  const timeout = config.websocket.agentTimeout;
  let onlineCount = 0;
  
  agentSessions.forEach((agent) => {
    if (now - agent.lastSeen < timeout && agent.status === 'online') {
      onlineCount++;
    }
  });
  
  // For demo, return a minimum of 3 agents (simulated)
  const count = Math.max(onlineCount, 3);
  res.json({ 
    count, 
    available: true, 
    message: '24/7 Support Available' 
  });
}