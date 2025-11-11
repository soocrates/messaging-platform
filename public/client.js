// client.js
import { handleCallback, isAuthenticated, getIdToken, getLoginUrl, signOut, parseJwt } from './auth-config.js';

(() => {
  'use strict';

  // Handle Cognito callback on page load
  if (window.location.search?.includes('code=')) {
    handleCallback()
      .then((success) => {
        if (success) {
          console.log('Successfully authenticated via authorization code');
          updateAuthUI();
        } else {
          console.warn('Authentication callback did not return tokens');
        }
      })
      .catch((err) => console.error('Error handling auth callback', err));
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    // Cache DOM elements
    const elements = {
      supportButton: document.getElementById('supportButton'),
      modalOverlay: document.getElementById('modalOverlay'),
      closeModal: document.getElementById('closeModal'),
      modalTitle: document.getElementById('modalTitle'),
      sidebar: document.getElementById('sidebar'),
      sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
      stepContactMethod: document.getElementById('stepContactMethod'),
      stepChat: document.getElementById('stepChat'),
      stepEmailCall: document.getElementById('stepEmailCall'),
      chatMessages: document.getElementById('chatMessages'),
      chatInput: document.getElementById('chatInput'),
      chatSendBtn: document.getElementById('chatSendBtn'),
      emailCallText: document.getElementById('emailCallText'),
      agentCount: document.getElementById('agentCount'),
      authContainer: document.getElementById('authContainer'),
      newCaseBtn: document.getElementById('newCaseBtn'),
      viewAllCasesBtn: document.getElementById('viewAllCasesBtn'),
      faqBtn: document.getElementById('faqBtn'),
      recentCasesList: document.getElementById('recentCasesList'),
      contactMethodButtons: document.querySelectorAll('.contact-method-btn')
    };

    // Application state
    const state = {
      selectedContactMethod: null,
      ws: null,
      sessionId: localStorage.getItem('supportSessionId') || null,
      sessionToken: localStorage.getItem('supportSessionToken') || null,
      currentCaseId: null,
      lastQuestions: []
    };

    // Initialize
    updateAuthUI();
    updateAgentAvailability();
    setInterval(updateAgentAvailability, 30000);

    // Event Listeners
    elements.supportButton.addEventListener('click', openModal);
    elements.closeModal.addEventListener('click', closeModal);
    elements.modalOverlay.addEventListener('click', handleOverlayClick);
    elements.sidebarToggleBtn.addEventListener('click', toggleSidebar);
    elements.newCaseBtn.addEventListener('click', handleNewCase);
    elements.viewAllCasesBtn.addEventListener('click', handleViewAllCases);
    elements.faqBtn.addEventListener('click', handleFAQ);
    elements.chatSendBtn.addEventListener('click', sendChatMessage);
    elements.chatInput.addEventListener('keydown', handleChatInputKeydown);
    elements.recentCasesList.addEventListener('click', handleCaseClick);
    elements.contactMethodButtons.forEach(btn => {
      btn.addEventListener('click', () => handleContactMethodClick(btn));
    });

    document.addEventListener('keydown', handleEscapeKey);

    // ===== Functions =====

    // Agent Availability
    async function updateAgentAvailability() {
      try {
        const res = await fetch('/api/agents/online');
        const data = await res.json();
        if (elements.agentCount) {
          elements.agentCount.textContent = `${data.count} agents online`;
        }
      } catch (err) {
        console.error('Failed to fetch agent availability', err);
      }
    }

    // Modal Management
    function openModal() {
      elements.modalOverlay.classList.add('active');
      showContactMethodSelection();
      updateAgentAvailability();
    }

    function closeModal() {
      elements.modalOverlay.classList.remove('active');
      if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.close();
      }
      resetToContactSelection();
    }

    function handleOverlayClick(e) {
      if (e.target === elements.modalOverlay) {
        closeModal();
      }
    }

    function handleEscapeKey(e) {
      if (e.key === 'Escape' && elements.modalOverlay.classList.contains('active')) {
        closeModal();
      }
    }

    // Sidebar Management
    function toggleSidebar() {
      elements.sidebar.classList.toggle('collapsed');
    }

    function handleNewCase() {
      showContactMethodSelection();
    }

    function handleViewAllCases() {
      console.log('View All Cases clicked');
      alert('View All Cases feature coming soon!');
    }

    function handleFAQ() {
      console.log('FAQ clicked');
      alert('FAQ feature coming soon!');
    }

    function handleCaseClick(e) {
      const caseItem = e.target.closest('li[data-caseid]');
      if (!caseItem) return;

      const caseId = caseItem.dataset.caseid;
      console.log('Loading case:', caseId);
      
      // Switch to chat view and load case
      elements.stepContactMethod.style.display = 'none';
      elements.stepEmailCall.classList.remove('active');
      elements.stepChat.classList.add('active');
      elements.modalTitle.textContent = 'Support Case';
      elements.chatMessages.innerHTML = '';
      addMessageToChat('agent', `Loaded previous chat for ${caseId}`, Date.now());
    }

    // Authentication UI
    function updateAuthUI() {
      if (isAuthenticated()) {
        const token = getIdToken();
        const payload = parseJwt(token);
        const email = payload?.email || 'My Account';

        elements.authContainer.innerHTML = `
          <div class="user-dropdown">
            <button type="button" class="user-email-button" aria-haspopup="true" aria-expanded="false">
              <span>${escapeHtml(email)}</span>
              <svg fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
            <div class="dropdown-menu" role="menu">
              <button type="button" class="dropdown-item" id="signOutBtn" role="menuitem">Sign Out</button>
            </div>
          </div>
        `;

        document.getElementById('signOutBtn')?.addEventListener('click', () => signOut());
      } else {
        elements.authContainer.innerHTML = `
          <button class="modal-signin" id="signinBtn" aria-label="Sign in">Sign In</button>
        `;

        document.getElementById('signinBtn')?.addEventListener('click', () => {
          window.location.href = getLoginUrl();
        });
      }
    }

    // Contact Method Selection
    async function handleContactMethodClick(btn) {
      state.selectedContactMethod = btn.dataset.method;
      elements.contactMethodButtons.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      
      showLoading();
      
      try {
        const questions = await getContextualQuestions(state.selectedContactMethod);
        if (state.selectedContactMethod === 'chat') {
          await initChat(questions);
        } else {
          showEmailCall(state.selectedContactMethod, questions);
        }
      } catch (err) {
        console.error('Failed to initialize contact method', err);
        alert('Failed to initialize. Please try again.');
        showContactMethodSelection();
      }
    }

    // Contextual Questions
    async function getContextualQuestions(contactMethod) {
      try {
        const res = await fetch('/api/support/questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            contactMethod, 
            userSessionId: state.sessionId 
          })
        });
        
        if (!res.ok) throw new Error('Failed to get questions');
        const data = await res.json();
        return data.questions || [];
      } catch (err) {
        console.error('Failed to get contextual questions', err);
        return getDefaultQuestions(contactMethod);
      }
    }

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

    // Chat Initialization
    async function initChat(questions = []) {
      state.lastQuestions = questions;
      elements.stepContactMethod.style.display = 'none';
      elements.stepEmailCall.classList.remove('active');
      elements.stepChat.classList.add('active');
      elements.modalTitle.textContent = 'Chat Support';
      elements.chatMessages.innerHTML = '';

      const base = location.origin.replace(/^http/, 'ws');
      const qp = new URLSearchParams();
      
      const idToken = getIdToken();
      if (idToken) qp.set('idToken', idToken);
      if (state.sessionId) {
        qp.set('sessionId', state.sessionId);
        if (state.sessionToken) qp.set('token', state.sessionToken);
      }
      
      const url = qp.toString() ? `${base}/?${qp}` : `${base}/`;

      state.ws = new WebSocket(url);

      state.ws.onopen = () => console.log('WebSocket connected', { url });

      state.ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          handleWebSocketMessage(data, questions);
        } catch (err) {
          console.error('Failed to parse WebSocket message', err);
        }
      };

      state.ws.onclose = (ev) => {
        console.log('WebSocket disconnected', { 
          code: ev.code, 
          reason: ev.reason, 
          wasClean: ev.wasClean 
        });
        
        if (ev.code === 1008) {
          addMessageToChat(
            'agent', 
            'Connection rejected by server (authentication required). Please sign in and try again.', 
            Date.now()
          );
          localStorage.removeItem('cognitoIdToken');
          updateAuthUI();
        }
      };

      state.ws.onerror = (err) => {
        console.error('WebSocket error', err);
        addMessageToChat('agent', 'Connection error. Please refresh and try again.', Date.now());
      };
    }

    function handleWebSocketMessage(data, questions) {
      switch (data.type) {
        case 'session':
          state.sessionId = data.sessionId;
          state.sessionToken = data.token;
          localStorage.setItem('supportSessionId', state.sessionId);
          localStorage.setItem('supportSessionToken', state.sessionToken);
          break;

        case 'history':
          if (data.history?.length > 0) {
            data.history.forEach(msg => 
              addMessageToChat(msg.sender, msg.content, msg.timestamp)
            );
          }
          if (questions.length > 0) {
            setTimeout(() => {
              questions.forEach((q, idx) => 
                setTimeout(() => addMessageToChat('agent', q, Date.now()), idx * 1500)
              );
            }, 500);
          }
          break;

        case 'message':
          addMessageToChat(data.sender, data.content, data.timestamp);
          break;

        case 'error':
          addMessageToChat('agent', 'Sorry, there was an error. Please try again.', Date.now());
          break;
      }
    }

    // Chat Messages
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
      elements.chatMessages.appendChild(messageDiv);
      elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
    }

    function sendChatMessage() {
      const content = elements.chatInput.value.trim();
      if (!content || !state.ws) return;

      if (state.ws.readyState !== WebSocket.OPEN) {
        addMessageToChat('agent', 'Connection closed. Please re-open the chat.', Date.now());
        return;
      }

      addMessageToChat('user', content, Date.now());
      state.ws.send(JSON.stringify({ type: 'message', content }));
      elements.chatInput.value = '';
      elements.chatInput.focus();
    }

    function handleChatInputKeydown(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendChatMessage();
      }
    }

    // Email/Call Support
    async function showEmailCall(method) {
      elements.stepContactMethod.style.display = 'none';
      elements.stepChat.classList.remove('active');
      elements.stepEmailCall.classList.add('active');
      elements.modalTitle.textContent = method === 'email' ? 'Email Support' : 'Call Support';

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
            description: `User requested support via ${method}`
          })
        });

        const result = await res.json();
        if (result.success) {
          state.currentCaseId = result.caseId;
          elements.emailCallText.textContent = method === 'email'
            ? `An agent will contact you via email shortly. Case ID: ${result.caseId}`
            : `An agent will call you shortly. Case ID: ${result.caseId}`;
        }
      } catch (err) {
        console.error('Failed to create support case', err);
        elements.emailCallText.textContent = 'Your request has been received. An agent will contact you shortly.';
      }
    }

    // View Management
    function showLoading() {
      elements.stepContactMethod.style.display = 'none';
      elements.stepChat.classList.remove('active');
      elements.stepEmailCall.classList.remove('active');
    }

    function showContactMethodSelection() {
      elements.stepContactMethod.style.display = 'block';
      elements.stepChat.classList.remove('active');
      elements.stepEmailCall.classList.remove('active');
      elements.modalTitle.textContent = 'Support Center';
      elements.contactMethodButtons.forEach(b => b.classList.remove('selected'));
      state.selectedContactMethod = null;
    }

    function resetToContactSelection() {
      showContactMethodSelection();
      if (state.ws) {
        state.ws.close();
        state.ws = null;
      }
    }

    // Utility Functions
    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }
})();