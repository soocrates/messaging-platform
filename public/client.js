import { getLoginUrl, handleCallback, isAuthenticated, getIdToken, signOut } from './auth-config.js';

(() => {
  'use strict';

  // Handle Cognito callback on page load
  if (window.location.hash && window.location.hash.includes('id_token=')) {
    const success = handleCallback();
    if (success) {
      console.log('Successfully authenticated');
    }
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // DOM Elements
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

    // Check if all required elements exist with detailed logging
    if (!supportButton || !modalOverlay || !closeModal) {
      console.error('Required DOM elements not found:', {
        supportButton: !!supportButton,
        modalOverlay: !!modalOverlay,
        closeModal: !!closeModal
      });
      return;
    }

    // State
    let selectedContactMethod = null;
    let ws = null;
    let sessionId = null;
    let sessionToken = null;
    let currentCaseId = null;
  let lastQuestions = [];

    // Fetch agent availability
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

    // Update agent availability on load and periodically
    updateAgentAvailability();
    setInterval(updateAgentAvailability, 30000);

    // Open Modal
    supportButton.addEventListener('click', () => {
      modalOverlay.classList.add('active');
      showContactMethodSelection();
      updateAgentAvailability();
    });

    // Sign-in button redirects to Cognito Hosted UI
    if (signinBtn) {
      signinBtn.addEventListener('click', () => {
        window.location.href = getLoginUrl();
      });
    }

    // Update signin button text based on auth state
    function updateAuthUI() {
      if (signinBtn) {
        signinBtn.textContent = isAuthenticated() ? 'Sign Out' : 'Sign In';
        if (isAuthenticated()) {
          signinBtn.addEventListener('click', signOut);
        } else {
          signinBtn.addEventListener('click', () => window.location.href = getLoginUrl());
        }
      }
    }

    // Update UI on load
    updateAuthUI();

    // Close Modal
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

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
        closeModalFunc();
      }
    });

    // Contact Method Selection
    contactMethodButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        selectedContactMethod = btn.dataset.method;
        
        // Update UI
        contactMethodButtons.forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');

        // Show loading
        showLoading();

        try {
          // Get contextual questions from backend
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

    // Get contextual questions from backend
    async function getContextualQuestions(contactMethod) {
      try {
        // Try to get saved session ID
        const savedSessionId = localStorage.getItem('supportSessionId');
        
        const res = await fetch('/api/support/questions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contactMethod,
            userSessionId: sessionId || savedSessionId || null
          })
        });

        if (!res.ok) {
          throw new Error('Failed to get questions');
        }

        const data = await res.json();
        return data.questions || [];
      } catch (err) {
        console.error('Failed to get contextual questions', err);
        // Return default questions
        return getDefaultQuestions(contactMethod);
      }
    }

    // Default questions if backend fails
    function getDefaultQuestions(contactMethod) {
      if (contactMethod === 'chat') {
        return [
          'How can we help you today?',
          'What service or feature are you having issues with?',
          'Can you describe the problem in more detail?'
        ];
      }
      return [];
    }

    // Initialize Chat
    async function initChat(questions) {
      // remember questions so we can retry connecting after auth
      lastQuestions = questions || [];
      stepContactMethod.style.display = 'none';
      stepEmailCall.classList.remove('active');
      stepChat.classList.add('active');
      modalTitle.textContent = 'Chat Support';
      chatMessages.innerHTML = '';

      // Connect to WebSocket
      const base = location.origin.replace(/^http/, 'ws');
  const qp = new URLSearchParams();
  // If user has Cognito ID token, include it in the connect query so server can verify
  const idToken = await getIdTokenFromUser();
  if (idToken) qp.set('idToken', idToken);
      if (sessionId) {
        qp.set('sessionId', sessionId);
        if (sessionToken) qp.set('token', sessionToken);
      }
      const url = qp.toString() ? `${base}/?${qp}` : `${base}/`;

      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('WebSocket connected', { url });
      };

      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          
          if (data.type === 'session') {
            sessionId = data.sessionId;
            sessionToken = data.token;
            localStorage.setItem('supportSessionId', sessionId);
            localStorage.setItem('supportSessionToken', sessionToken);
          } else if (data.type === 'history') {
            // Load chat history
            if (data.history && data.history.length > 0) {
              data.history.forEach(msg => {
                addMessageToChat(msg.sender, msg.content, msg.timestamp);
              });
            }
            // Show agent questions
            if (questions.length > 0) {
              setTimeout(() => {
                questions.forEach((q, idx) => {
                  setTimeout(() => {
                    addMessageToChat('agent', q, Date.now());
                  }, idx * 1500);
                });
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

      ws.onclose = async (ev) => {
        try {
          console.log('WebSocket disconnected', { code: ev.code, reason: ev.reason, wasClean: ev.wasClean });
        } catch (e) {
          console.log('WebSocket disconnected');
        }

        // If server rejected connection for authentication (policy / auth), prompt user to provide token and retry
        try {
          if (ev && ev.code === 1008) {
            addMessageToChat('agent', 'Connection rejected by server (authentication required). Please provide your Cognito ID token.', Date.now());
            // remove any cached token and ask user
            localStorage.removeItem('cognitoIdToken');
            const newToken = await getIdTokenFromUser();
            if (newToken) {
              // attempt reconnect with same questions
              setTimeout(() => initChat(lastQuestions), 400);
            }
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error', err);
        addMessageToChat('agent', 'Connection error. Please refresh and try again.', Date.now());
      };

      // Load saved session if exists
      const savedSessionId = localStorage.getItem('supportSessionId');
      const savedToken = localStorage.getItem('supportSessionToken');
      if (savedSessionId && savedToken) {
        sessionId = savedSessionId;
        sessionToken = savedToken;
      }
    }

    // Get Cognito ID token
    async function getIdTokenFromUser() {
      return getIdToken();
    }

    // Add message to chat
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

    // Send chat message
    function sendChatMessage() {
      const content = chatInput.value.trim();
      if (!content) return;
      if (!ws) {
        console.warn('WebSocket not initialized, cannot send message');
        addMessageToChat('agent', 'Connection not established. Please re-open the chat.', Date.now());
        return;
      }
      if (ws.readyState !== WebSocket.OPEN) {
        console.warn('WebSocket not open, readyState=', ws.readyState);
        addMessageToChat('agent', 'Connection closed. Please re-open the chat.', Date.now());
        return;
      }

      // Add user message to UI
      addMessageToChat('user', content, Date.now());
      
      // Send to server
      ws.send(JSON.stringify({ type: 'message', content }));
      
      chatInput.value = '';
      chatInput.focus();
    }

    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        sendChatMessage();
      }
    });

    // Show Email/Call interface
    async function showEmailCall(method, questions) {
      stepContactMethod.style.display = 'none';
      stepChat.classList.remove('active');
      stepEmailCall.classList.add('active');
      
      modalTitle.textContent = method === 'email' ? 'Email Support' : 'Call Support';
      
      // Create support case
      try {
        const res = await fetch('/api/support/cases', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
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

    // Show loading state
    function showLoading() {
      stepContactMethod.style.display = 'none';
      stepChat.classList.remove('active');
      stepEmailCall.classList.remove('active');
      // Could add a loading spinner here
    }

    // Show contact method selection
    function showContactMethodSelection() {
      stepContactMethod.style.display = 'flex';
      stepChat.classList.remove('active');
      stepEmailCall.classList.remove('active');
      modalTitle.textContent = 'Support';
      contactMethodButtons.forEach(b => b.classList.remove('selected'));
      selectedContactMethod = null;
    }

    // Reset to contact selection
    function resetToContactSelection() {
      showContactMethodSelection();
      if (ws) {
        ws.close();
        ws = null;
      }
    }
  }
})();