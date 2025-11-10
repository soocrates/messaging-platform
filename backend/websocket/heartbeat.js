export function heartbeat() { 
  this.isAlive = true; 
}

export function setupHeartbeat(wss, pingInterval) {
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      try { 
        ws.ping(); 
      } catch {}
    });
  }, pingInterval);

  wss.on('close', () => clearInterval(interval));
}