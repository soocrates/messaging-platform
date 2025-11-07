// client.js

// STEP 1: Import from your working auth-config.js file instead
import { handleCallback, isAuthenticated, getIdToken, getLoginUrl, signOut } from './auth-config.js';

(() => {
  'use strict';

  // Handle Cognito callback on page load (authorization code flow)
  if (window.location.search && window.location.search.includes('code=')) {
    handleCallback().then((success) => {
      if (success) {
        console.log('Successfully authenticated via authorization code');
        // Refresh UI elements that depend on auth
        try { updateAuthUI(); } catch (e) { /* ignore */ }
      } else {
        console.warn('Authentication callback did not return tokens');
      }
    }).catch((err) => {
      console.error('Error handling auth callback', err);
    });
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // DOM Elements (no changes here)
    const supportButton = document.getElementById('supportButton');
    const modalOverlay = document.getElementById('modalOverlay');
    const closeModal = document.getElementById('closeModal');
    const modalTitle = document.getElementById('modalTitle');
    const stepContactMethod = document.getElementById('stepContactMethod');
    const stepChat = document.getElementById('stepChat');
    const stepEmailCall = document.getElementById('stepEmailCall');
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const chatSendBtn = document.getElementById('chatSendBtn');
    const emailCallMessage = document.getElementById('emailCallMessage');
    const emailCallText = document.getElementById('emailCallText');
    const agentCount = document.getElementById('agentCount');
    const contactMethodButtons = document.querySelectorAll('.contact-method-btn');
    const signinBtn = document.getElementById('signinBtn');

    // State (no changes here)
    let selectedContactMethod = null;
    let ws = null;
    let sessionId = null;
    let sessionToken = null;
    let currentCaseId = null;
    let lastQuestions = [];

    // Fetch agent availability (no changes here)
    async function updateAgentAvailability() {
      try {
        const res = await fetch('/api/agents/online');
        const data = await res.json();
        if (agentCount) {
          agentCount.textContent = `(${data.count} agents online)`;
        }
      } catch (err) {
        console.error('Failed to fetch agent availability', err);
      }
    }
    updateAgentAvailability();
    setInterval(updateAgentAvailability, 30000);

    // Open Modal (no changes here)
    supportButton.addEventListener('click', () => {
      modalOverlay.classList.add('active');
      showContactMethodSelection();
      updateAgentAvailability();
    });

    // STEP 2: Update the sign-in button logic
    if (signinBtn) {
      signinBtn.addEventListener('click', () => {
        if (isAuthenticated()) {
          // If logged in, sign out
          signOut();
        } else {
          // If logged out, redirect to the Cognito login page
          window.location.href = getLoginUrl();
        }
      });
    }

    // Update signin button text based on auth state (no changes here)
    function updateAuthUI() {
      if (signinBtn) {
        signinBtn.textContent = isAuthenticated() ? 'Sign Out' : 'Sign In';
      }
    }

    // Update UI on load
    updateAuthUI();
    // STEP 3: Remove the userManager event listeners as they no longer exist
    // userManager.events.addUserLoaded(() => updateAuthUI());
    // userManager.events.addUserUnloaded(() => updateAuthUI());


    // Close Modal (no changes here)
    const closeModalFunc = () => {
      modalOverlay.classList.remove('active');
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
      resetToContactSelection();
    };
    closeModal.addEventListener('click', closeModalFunc);
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModalFunc();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeModalFunc();
      }
    });

    // Contact Method Selection (no changes here)
    contactMethodButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedContactMethod = btn.dataset.method;
        contactMethodButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        showLoading();
        try {
          const questions = await getContextualQuestions(selectedContactMethod);
          if (selectedContactMethod === 'chat') {
            await initChat(questions);
          } else {
            showEmailCall(selectedContactMethod, questions);
          }
        } catch (err) {
          console.error('Failed to initialize contact method', err);
          alert('Failed to initialize. Please try again.');
          showContactMethodSelection();
        }
      });
    });

    // Get contextual questions from backend (no changes here)
    async function getContextualQuestions(contactMethod) {
      try {
        const savedSessionId = localStorage.getItem('supportSessionId');
        const res = await fetch('/api/support/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactMethod, userSessionId: sessionId || savedSessionId || null })
        });
        if (!res.ok) throw new Error('Failed to get questions');
        const data = await res.json();
        return data.questions || [];
      } catch (err) {
        console.error('Failed to get contextual questions', err);
        return getDefaultQuestions(contactMethod);
      }
    }

    // Default questions if backend fails (no changes here)
    function getDefaultQuestions(contactMethod) {
      if (contactMethod === 'chat') {
        return ['How can we help you today?', 'What service or feature are you having issues with?', 'Can you describe the problem in more detail?'];
      }
      return [];
    }

    // Initialize Chat
    async function initChat(questions) {
      lastQuestions = questions || [];
      stepContactMethod.style.display = 'none';
      stepEmailCall.classList.remove('active');
      stepChat.classList.add('active');
      modalTitle.textContent = 'Chat Support';
      chatMessages.innerHTML = '';

      const base = location.origin.replace(/^http/, 'ws');
      const qp = new URLSearchParams();
      
      // STEP 4: Use your simple getIdToken function
      const idToken = getIdToken();
      if (idToken) qp.set('idToken', idToken);

      if (sessionId) {
        qp.set('sessionId', sessionId);
        if (sessionToken) qp.set('token', sessionToken);
      }
      const url = qp.toString() ? `${base}/?${qp}` : `${base}/`;

      ws = new WebSocket(url);

      ws.onopen = () => console.log('WebSocket connected', { url });

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'session') {
            sessionId = data.sessionId;
            sessionToken = data.token;
            localStorage.setItem('supportSessionId', sessionId);
            localStorage.setItem('supportSessionToken', sessionToken);
          } else if (data.type === 'history') {
            if (data.history && data.history.length > 0) {
              data.history.forEach(msg => addMessageToChat(msg.sender, msg.content, msg.timestamp));
            }
            if (questions.length > 0) {
              setTimeout(() => {
                questions.forEach((q, idx) => setTimeout(() => addMessageToChat('agent', q, Date.now()), idx * 1500));
              }, 500);
            }
          } else if (data.type === 'message') {
            addMessageToChat(data.sender, data.content, data.timestamp);
          } else if (data.type === 'error') {
            addMessageToChat('agent', 'Sorry, there was an error. Please try again.', Date.now());
          }
        } catch (err) {
          console.error('Failed to parse WebSocket message', err);
        }
      };

      ws.onclose = (ev) => {
        console.log('WebSocket disconnected', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        if (ev && ev.code === 1008) {
          addMessageToChat('agent', 'Connection rejected by server (authentication required). Please sign in and try again.', Date.now());
          localStorage.removeItem('cognitoIdToken'); // Clear potentially bad token
          updateAuthUI();
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error', err);
        addMessageToChat('agent', 'Connection error. Please refresh and try again.', Date.now());
      };

      const savedSessionId = localStorage.getItem('supportSessionId');
      const savedToken = localStorage.getItem('supportSessionToken');
      if (savedSessionId && savedToken) {
        sessionId = savedSessionId;
        sessionToken = savedToken;
      }
    }

    // Remaining functions (addMessageToChat, sendChatMessage, etc.) have no changes
    function addMessageToChat(sender, content, timestamp) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `message ${sender}`;
      const avatar = document.createElement('div');
      avatar.className = 'message-avatar';
      avatar.textContent = sender === 'agent' ? 'A' : 'U';
      const contentDiv = document.createElement('div');
      contentDiv.className = 'message-content';
      const bubble = document.createElement('div');
      bubble.className = 'message-bubble';
      bubble.textContent = content;
      const time = document.createElement('div');
      time.className = 'message-time';
      const date = new Date(timestamp);
      time.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      contentDiv.appendChild(bubble);
      contentDiv.appendChild(time);
      messageDiv.appendChild(avatar);
      messageDiv.appendChild(contentDiv);
      chatMessages.appendChild(messageDiv);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function sendChatMessage() {
      const content = chatInput.value.trim();
      if (!content || !ws) return;
      if (ws.readyState !== WebSocket.OPEN) {
        addMessageToChat('agent', 'Connection closed. Please re-open the chat.', Date.now());
        return;
      }
      addMessageToChat('user', content, Date.now());
      ws.send(JSON.stringify({ type: 'message', content }));
      chatInput.value = '';
      chatInput.focus();
    }
    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });

    async function showEmailCall(method) {
      stepContactMethod.style.display = 'none';
      stepChat.classList.remove('active');
      stepEmailCall.classList.add('active');
      modalTitle.textContent = method === 'email' ? 'Email Support' : 'Call Support';
      try {
        const res = await fetch('/api/support/cases', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contactMethod: method,
            helpType: 'other',
            service: 'General',
            category: 'Support Request',
            severity: 'medium',
            subject: `${method === 'email' ? 'Email' : 'Call'} Support Request`,
            description: 'User requested support via ' + method
          })
        });
        const result = await res.json();
        if (result.success) {
          currentCaseId = result.caseId;
          emailCallText.textContent = method === 'email'
            ? `An agent will contact you via email shortly. Case ID: ${result.caseId}`
            : `An agent will call you shortly. Case ID: ${result.caseId}`;
        }
      } catch (err) {
        console.error('Failed to create support case', err);
        emailCallText.textContent = 'Your request has been received. An agent will contact you shortly.';
      }
    }

    function showLoading() {
      stepContactMethod.style.display = 'none';
      stepChat.classList.remove('active');
      stepEmailCall.classList.remove('active');
    }

    function showContactMethodSelection() {
      stepContactMethod.style.display = 'flex';
      stepChat.classList.remove('active');
      stepEmailCall.classList.remove('active');
      modalTitle.textContent = 'Support';
      contactMethodButtons.forEach(b => b.classList.remove('selected'));
      selectedContactMethod = null;
    }

    function resetToContactSelection() {
      showContactMethodSelection();
      if (ws) {
        ws.close();
        ws = null;
      }
    }
  }
})();