document.addEventListener('DOMContentLoaded', () => {
  const logContainer = document.getElementById('logs');
  const toggleLogsButton = document.getElementById('toggleLogsButton');
  const systemPromptDisplay = document.getElementById('systemPromptDisplay');
  const agentTabs = document.getElementById('agentTabs');
  const chatArea = document.getElementById('chatArea');
  const chatHistoryContainer = document.getElementById('chatHistoryContainer');
  const userMessageInput = document.getElementById('userMessageInput');
  const sendMessageButton = document.getElementById('sendMessageButton');
  const logLevelFilter = document.getElementById('logLevelFilter');
  const toggleRawLogButton = document.getElementById('toggleRawLogButton');
  const rawLogPanel = document.getElementById('rawLogPanel');

  let currentAgentId = null;
  let logsVisible = localStorage.getItem('logsVisible') === 'true';

  const logLevels = {
    error: localStorage.getItem('logLevel_error') === 'true' || true,
    info: localStorage.getItem('logLevel_info') === 'true' || true,
    debug: localStorage.getItem('logLevel_debug') === 'true' || true
  };

  function updateLogLevelUI() {
    if (!logLevelFilter) return;
    logLevelFilter.innerHTML = '';
    ['error','info','debug'].forEach(level => {
      const btn = document.createElement('button');
      btn.classList.add('log-level-toggle');
      btn.dataset.level = level;
      btn.textContent = level.toUpperCase();
      if (logLevels[level]) {
        btn.classList.add('active');
      }
      btn.addEventListener('click', () => toggleLogLevel(level));
      logLevelFilter.appendChild(btn);
    });
  }

  function toggleLogLevel(level) {
    logLevels[level] = !logLevels[level];
    localStorage.setItem(`logLevel_${level}`, logLevels[level]);
    updateLogLevelUI();
  }

  // Show/hide the short logs
  if (logsVisible) {
    logContainer.classList.remove('hidden');
    toggleLogsButton.textContent = 'Hide Logs';
  } else {
    logContainer.classList.add('hidden');
    toggleLogsButton.textContent = 'Show Logs';
  }

  toggleLogsButton.addEventListener('click', () => {
    logsVisible = !logsVisible;
    localStorage.setItem('logsVisible', logsVisible);
    if (logsVisible) {
      logContainer.classList.remove('hidden');
      toggleLogsButton.textContent = 'Hide Logs';
    } else {
      logContainer.classList.add('hidden');
      toggleLogsButton.textContent = 'Show Logs';
    }
  });

  // Toggle the raw log panel
  toggleRawLogButton.addEventListener('click', () => {
    rawLogPanel.classList.toggle('show');
  });

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

  async function fetchLogs(agentId) {
    try {
      const resp = await fetch(`/agent/${agentId}/logs`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      return [];
    }
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

  function renderMainChat(messages) {
    chatArea.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatArea.textContent = 'No chat messages';
      return;
    }
    const chatMessages = messages.filter(m => m.role !== 'system');
    chatMessages.forEach(msg => {
      const msgGroup = document.createElement('div');
      msgGroup.className = 'message-group';

      const div = document.createElement('div');
      div.classList.add('chat-message', msg.role);
      div.innerHTML = `<strong>${msg.role.toUpperCase()}:</strong> ${msg.content || ''}`;
      msgGroup.appendChild(div);

      chatArea.appendChild(msgGroup);
    });
  }

  function renderRawLogs(logs) {
    rawLogPanel.innerHTML = '';
    if (!logs || logs.length === 0) {
      rawLogPanel.textContent = 'No detailed logs';
      return;
    }
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.textContent = logs.join('\n');
    rawLogPanel.appendChild(pre);
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
    const [prompt, history, aiResp, logData] = await Promise.all([
      fetchSystemPrompt(currentAgentId),
      fetchChatHistory(currentAgentId),
      fetchAIResponse(currentAgentId),
      fetchLogs(currentAgentId)
    ]);
    systemPromptDisplay.textContent = prompt || '';
    renderChatHistory(history);
    renderMainChat(history);
    renderRawLogs(logData);
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

  updateLogLevelUI();
});