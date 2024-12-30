document.addEventListener('DOMContentLoaded', () => {
  const systemPromptDisplay = document.getElementById('systemPromptDisplay');
  const agentTabs = document.getElementById('agentTabs');
  const chatArea = document.getElementById('chatArea');
  const chatHistoryContainer = document.getElementById('chatHistoryContainer');
  const userMessageInput = document.getElementById('userMessageInput');
  const sendMessageButton = document.getElementById('sendMessageButton');

  let currentAgentId = null;
  let llmRequestsData = [];

  async function fetchAgents() {
    try {
      const resp = await fetch('/agents');
      const data = await resp.json();
      return data;
    } catch (err) {
      console.error('fetchAgents error:', err);
      return [];
    }
  }

  async function fetchSystemPrompt(agentId) {
    try {
      const resp = await fetch(`/agent/${agentId}/system-prompt`);
      if (!resp.ok) return '';
      return await resp.text();
    } catch (err) {
      return '';
    }
  }

  async function fetchChatHistory(agentId) {
    try {
      const resp = await fetch(`/agent/${agentId}/chat-history`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      return [];
    }
  }

  async function fetchAIResponse(agentId) {
    try {
      const resp = await fetch(`/agent/${agentId}/ai-response`);
      if (!resp.ok) return '';
      return await resp.text();
    } catch (err) {
      return '';
    }
  }

  async function fetchLlmRequests(agentId) {
    try {
      const resp = await fetch(`/agent/${agentId}/llm-requests`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      console.error('Error fetching LLM requests:', err);
      return [];
    }
  }

  function createShowRequestButton(iteration) {
    const button = document.createElement('button');
    button.className = 'llm-details-button';
    button.innerText = 'Toggle Details Off';
    
    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'llm-details-container';

    const matchingRequest = llmRequestsData.find(r => r.iteration === iteration);
    if (matchingRequest) {
      // Request Section
      const requestSection = document.createElement('div');
      requestSection.className = 'llm-section';
      
      const requestTitle = document.createElement('div');
      requestTitle.className = 'llm-section-title';
      requestTitle.innerText = 'REQUEST';
      
      const requestContent = document.createElement('div');
      requestContent.className = 'llm-content';
      requestContent.innerText = JSON.stringify(matchingRequest.requestData, null, 2);
      
      requestSection.appendChild(requestTitle);
      requestSection.appendChild(requestContent);
      
      // Response Section
      const responseSection = document.createElement('div');
      responseSection.className = 'llm-section';
      
      const responseTitle = document.createElement('div');
      responseTitle.className = 'llm-section-title';
      responseTitle.innerText = 'RESPONSE';
      
      const responseContent = document.createElement('div');
      responseContent.className = 'llm-content';
      responseContent.innerText = JSON.stringify(matchingRequest.responseData, null, 2);
      
      responseSection.appendChild(responseTitle);
      responseSection.appendChild(responseContent);
      
      detailsContainer.appendChild(requestSection);
      detailsContainer.appendChild(responseSection);
    } else {
      detailsContainer.innerText = 'No matching request found.';
    }

    let isVisible = false;
    button.addEventListener('click', () => {
      isVisible = !isVisible;
      button.innerText = isVisible ? 'Toggle Details Off' : 'Toggle Details On';
      if (isVisible) {
        detailsContainer.classList.add('visible');
      } else {
        detailsContainer.classList.remove('visible');
      }
    });

    return { button, detailsContainer };
  }

  function renderMainChat(messages) {
    chatArea.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatArea.textContent = 'No chat messages';
      return;
    }
    let assistantCounter = 0; 
    const chatMessages = messages.filter(m => m.role !== 'system');

    chatMessages.forEach(msg => {
      const msgGroup = document.createElement('div');
      msgGroup.className = 'message-group';

      const div = document.createElement('div');
      div.classList.add('chat-message', msg.role);
      div.innerHTML = `<strong>${msg.role.toUpperCase()}:</strong> ${msg.content || ''}`;
      msgGroup.appendChild(div);

      // If it's an assistant message, add the "Show LLM request" button
      if (msg.role === 'assistant') {
        // We assume each assistant message corresponds to an LLM call iteration
        // so iteration is 1-based for each assistant message
        assistantCounter++;
        const { button, detailsContainer } = createShowRequestButton(assistantCounter);
        msgGroup.appendChild(button);
        msgGroup.appendChild(detailsContainer);
      }

      chatArea.appendChild(msgGroup);
    });
  }

  function renderChatHistory(messages) {
    chatHistoryContainer.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatHistoryContainer.textContent = 'No chat history';
      return;
    }
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.classList.add('chat-message', msg.role);
      div.textContent = `${msg.role.toUpperCase()}: ${msg.content || ''}`;
      chatHistoryContainer.appendChild(div);
    });
  }

  function renderAgentTabs(agents) {
    agentTabs.innerHTML = '';
    if (!agents || agents.length === 0) {
      agentTabs.innerHTML = '<div class="agent-tab">No Agents</div>';
      return;
    }
    agents.forEach(a => {
      const tab = document.createElement('div');
      tab.classList.add('agent-tab');
      tab.textContent = a.name;
      if (currentAgentId === a.id) {
        tab.classList.add('selected');
      }
      tab.addEventListener('click', () => {
        currentAgentId = a.id;
        document.querySelectorAll('.agent-tab').forEach(t => t.classList.remove('selected'));
        tab.classList.add('selected');
        refreshAgentData();
      });
      agentTabs.appendChild(tab);
    });
  }

  async function refreshAgentData() {
    if (!currentAgentId) return;
    const [prompt, history, requests] = await Promise.all([
      fetchSystemPrompt(currentAgentId),
      fetchChatHistory(currentAgentId),
      fetchLlmRequests(currentAgentId)
    ]);
    llmRequestsData = requests || [];
    systemPromptDisplay.textContent = prompt || '';
    renderChatHistory(history);
    renderMainChat(history);
  }

  (async () => {
    const agents = await fetchAgents();
    if (agents.length > 0) {
      currentAgentId = agents[0].id;
    }
    renderAgentTabs(agents);
    refreshAgentData();
  })();

  if (sendMessageButton) {
    sendMessageButton.addEventListener('click', async () => {
      if (!currentAgentId) return;
      const msg = userMessageInput.value.trim();
      userMessageInput.value = '';
      if (!msg) return;
      try {
        await fetch(`/agent/${currentAgentId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg })
        });
        await refreshAgentData();
      } catch (err) {
        console.error('Error sending message:', err);
      }
    });
  }

  if (userMessageInput) {
    userMessageInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        sendMessageButton.click();
      }
    });
  }
});