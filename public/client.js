(() => {
  let ws = null;
  const el = (id) => document.getElementById(id);
  const logEl = el('log');

  function log(line, cls = '') {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.innerHTML = line;
    logEl.appendChild(div);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function tsFormat(ms) {
    const d = new Date(ms);
    return d.toLocaleString();
  }

  function setConnectedState(connected) {
    el('sendBtn').disabled = !connected;
    el('disconnectBtn').disabled = !connected;
    el('connectBtn').disabled = connected;
    el('loadHistoryBtn').disabled = !connected;
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }

  function renderMessage(m) {
    const cls = m.sender === 'user' ? 'msg-user' : (m.sender === 'agent' ? 'msg-agent' : 'msg-bot');
    const t = tsFormat(m.timestamp);
    log(`[${t}] <b>${m.sender}</b>: ${escapeHtml(m.content)}`, cls);
  }

  el('connectBtn').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    const sid = el('sessionId').value.trim();
    const tok = el('sessionToken').value.trim();
    const idt = (document.getElementById('idToken')?.value || '').trim();
    const base = location.origin.replace(/^http/, 'ws');
    const qp = new URLSearchParams();
    if (sid) qp.set('sessionId', sid);
    if (tok) qp.set('token', tok);
    if (idt) qp.set('idToken', idt);
    const url = qp.toString() ? `${base}/?${qp}` : `${base}/`;

    ws = new WebSocket(url);

    ws.onopen = () => {
      log('Connected to server', 'msg-meta');
      setConnectedState(true);
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data);
        if (data.type === 'session') {
          if (data.sessionId) {
            el('sessionId').value = data.sessionId;
            localStorage.setItem('sid', data.sessionId);
          }
          if (data.token) {
            el('sessionToken').value = data.token;
            localStorage.setItem('tok', data.token);
          }
          log(`Session established: ${data.sessionId}`, 'msg-meta');
        } else if (data.type === 'history') {
          log(`Loaded history for session ${data.sessionId}`, 'msg-meta');
          data.history.forEach(renderMessage);
        } else if (data.type === 'message') {
          renderMessage(data);
        } else if (data.type === 'error') {
          log(`Error: ${data.message}`, 'msg-meta');
        }
      } catch {
        log('Invalid message from server', 'msg-meta');
      }
    };

    ws.onclose = () => {
      log('Disconnected', 'msg-meta');
      setConnectedState(false);
    };

    ws.onerror = () => {
      log('WebSocket error', 'msg-meta');
    };
  });

  el('disconnectBtn').addEventListener('click', () => {
    if (ws) ws.close();
  });

  el('sendBtn').addEventListener('click', () => {
    const content = el('message').value.trim();
    if (!content || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'message', content }));
    el('message').value = '';
    el('message').focus();
  });

  el('newSessionBtn').addEventListener('click', () => {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    el('sessionId').value = '';
    el('sessionToken').value = '';
    localStorage.removeItem('sid');
    localStorage.removeItem('tok');
    log('Ready for a new session. Click Connect.', 'msg-meta');
  });

  el('loadHistoryBtn').addEventListener('click', async () => {
    const sid = el('sessionId').value.trim();
    const tok = el('sessionToken').value.trim();
    const idt = (document.getElementById('idToken')?.value || '').trim();
    if (!sid) return;
    try {
      const headers = { 'x-session-id': sid, 'x-session-token': tok };
      if (idt) headers['Authorization'] = `Bearer ${idt}`;
      const res = await fetch(`/history/${encodeURIComponent(sid)}`, { headers });
      const json = await res.json();
      log(`History fetched via REST for ${sid}`, 'msg-meta');
      json.history.forEach(renderMessage);
    } catch {
      log('Failed to fetch history', 'msg-meta');
    }
  });

  el('message').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('sendBtn').click();
  });
})();

