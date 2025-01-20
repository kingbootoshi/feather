// Theme definitions for Feather GUI
const themes = {
  // Default Feather theme (Cream/Blue)
  light: {
    '--bg-primary': '#F4F1EA',
    '--bg-secondary': '#E8E4D9',
    '--accent-blue': '#7A9BB6',
    '--accent-dark': '#2F4858',
    '--text-primary': '#2F353B',
    '--border-color': '#D5CFC3',
    '--hover-color': '#EAE6DC',
    '--shadow-color': 'rgba(47, 53, 59, 0.1)'
  },
  // Cypher Core theme (Orange/Black)
  dark: {
    '--bg-primary': '#000000',
    '--bg-secondary': '#1A1A1A',
    '--accent-blue': '#FF8C00',
    '--accent-dark': '#FF4500',
    '--text-primary': '#DDDDDD',
    '--border-color': '#FF8C00',
    '--hover-color': '#111111',
    '--shadow-color': 'rgba(255,140,0,0.3)'
  },
  // Synthwave theme (Purple/Pink)
  synthwave: {
    '--bg-primary': '#2B0136',
    '--bg-secondary': '#3C0064',
    '--accent-blue': '#FF4FF8',
    '--accent-dark': '#F443E3',
    '--text-primary': '#FFC3F4',
    '--border-color': '#F443E3',
    '--hover-color': '#4C008C',
    '--shadow-color': 'rgba(255, 79, 248, 0.25)'
  }
};

// Apply theme by setting CSS variables
function applyTheme(themeName) {
  const root = document.documentElement;
  const themeVars = themes[themeName] || themes.light;
  Object.entries(themeVars).forEach(([varName, value]) => {
    root.style.setProperty(varName, value);
  });
}

// Load saved theme from localStorage
function loadSavedTheme() {
  return localStorage.getItem('featherTheme') || 'light';
}

// Save theme preference to localStorage
function saveTheme(themeName) {
  localStorage.setItem('featherTheme', themeName);
}

document.addEventListener('DOMContentLoaded', () => {
  // Elements from the DOM for user interface
  const systemPromptDisplay = document.getElementById('systemPromptDisplay');
  const agentTabs = document.getElementById('agentTabs');
  const chatArea = document.getElementById('chatArea');
  const chatHistoryContainer = document.getElementById('chatHistoryContainer');
  const userMessageInput = document.getElementById('userMessageInput');
  const sendMessageButton = document.getElementById('sendMessageButton');

  // Initialize theme selector
  const themeSelector = document.getElementById('themeSelector');
  if (themeSelector) {
    // Load and apply saved theme
    const initialTheme = loadSavedTheme();
    themeSelector.value = initialTheme;
    applyTheme(initialTheme);

    // Handle theme changes
    themeSelector.addEventListener('change', (e) => {
      const newTheme = e.target.value;
      applyTheme(newTheme);
      saveTheme(newTheme);
    });
  }

  let currentAgentId = null;
  let llmRequestsData = [];
  let socket = null;
  let activeAgents = new Map();

  /**
   * Helper function to render the content of a message (which can be text or images).
   */
  function renderMessageContent(content) {
    // If content is just a string, return as-is, preserving XML tags but replacing newlines with spaces
    if (!content) return '';
    if (typeof content === 'string') {
      // Replace newlines with spaces while preserving XML tags
      return content.replace(/\n/g, ' ');
    }
    // Otherwise, content might be an array of objects (text or image_url)
    if (Array.isArray(content)) {
      let result = '';
      let images = [];
      
      // First collect text and gather images
      content.forEach(item => {
        if (item.type === 'text') {
          // Replace newlines with spaces while preserving XML tags
          result += item.text.replace(/\n/g, ' ');
        } else if (item.type === 'image_url') {
          const url = item.image_url?.url || '';
          if (url) {
            images.push(url);
          }
        }
      });

      // Add text first
      result = result.trim();
      
      // Then add images container if we have images
      if (images.length > 0) {
        result += '<div class="chat-images-container">';
        images.forEach(url => {
          result += `<img class="chat-image" src="${url}" alt="chat image"/>`;
        });
        result += '</div>';
      }
      
      return result;
    }
    return '';
  }

  /**
   * Initiates a WebSocket connection to receive real-time updates from the server.
   * Reconnects automatically if the socket closes.
   */
  function startWebSocket() {
    socket = new WebSocket(`ws://${window.location.host}/debug`);

    socket.onopen = () => {
      console.log("WebSocket connected");
    };

    // Handle incoming messages that update the GUI state
    socket.onmessage = (msgEvent) => {
      const data = JSON.parse(msgEvent.data);
      switch (data.type) {
        case 'agents':
          // Store agents data
          data.agents.forEach(agent => {
            if (!activeAgents.has(agent.id)) {
              activeAgents.set(agent.id, {
                id: agent.id,
                name: agent.name,
                chatHistory: [],
                systemPrompt: '',
                llmRequests: []
              });
            }
          });
          
          // If no current agent is set, pick the first from the list
          if (!currentAgentId && data.agents.length > 0) {
            currentAgentId = data.agents[0].id;
          }
          renderAgentTabs(data.agents);
          refreshAgentData();
          break;

        case 'newAgentSession':
          // A new agent was registered on the server
          console.log("New agent session:", data.agent.id);
          refreshAgentsAndSelectIfNone();
          break;

        case 'systemPromptUpdated':
          // Update stored system prompt
          if (activeAgents.has(data.agentId)) {
            activeAgents.get(data.agentId).systemPrompt = data.prompt;
            if (data.agentId === currentAgentId) {
              systemPromptDisplay.textContent = data.prompt;
            }
          }
          break;

        case 'chatHistoryUpdated':
          // Update stored chat history for the agent
          if (activeAgents.has(data.agentId)) {
            activeAgents.get(data.agentId).chatHistory = data.messages;
            if (data.agentId === currentAgentId) {
              llmRequestsData = activeAgents.get(data.agentId).llmRequests || [];
              renderChatHistory(data.messages);
              renderMainChat(data.messages);
            }
          }
          break;

        case 'aiResponseUpdated':
          // We currently refresh chat entirely on chatHistoryUpdated
          break;

        case 'agentLogsUpdated':
          // Not displayed by default in this UI
          break;

        case 'llmRequestsUpdated':
          // Detailed data about LLM requests for the agent
          if (activeAgents.has(data.agentId)) {
            activeAgents.get(data.agentId).llmRequests = data.requests;
            if (data.agentId === currentAgentId) {
              llmRequestsData = data.requests;
              const cachedAgent = activeAgents.get(currentAgentId);
              if (cachedAgent) {
                renderMainChat(cachedAgent.chatHistory);
              }
            }
          }
          break;

        default:
          console.log("Unhandled message type:", data);
          break;
      }
    };

    socket.onclose = () => {
      console.log("WebSocket closed, reconnecting in 3 seconds...");
      setTimeout(startWebSocket, 3000);
    };
  }

  // Start the WebSocket connection
  startWebSocket();

  /**
   * Fetches a list of agents from the server.
   */
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

  /**
   * Fetches the system prompt text for a given agent ID.
   */
  async function fetchSystemPrompt(agentId) {
    try {
      const encodedId = encodeURIComponent(agentId);
      const resp = await fetch(`/agent/${encodedId}/system-prompt`);
      if (!resp.ok) return '';
      return await resp.text();
    } catch (err) {
      console.error('Error fetching system prompt:', err);
      return '';
    }
  }

  /**
   * Fetches the chat history for a given agent ID.
   */
  async function fetchChatHistory(agentId) {
    try {
      const encodedId = encodeURIComponent(agentId);
      const resp = await fetch(`/agent/${encodedId}/chat-history`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      console.error('Error fetching chat history:', err);
      return [];
    }
  }

  /**
   * Fetches the LLM requests stored for a given agent ID.
   */
  async function fetchLlmRequests(agentId) {
    try {
      const encodedId = encodeURIComponent(agentId);
      const resp = await fetch(`/agent/${encodedId}/llm-requests`);
      if (!resp.ok) return [];
      return await resp.json();
    } catch (err) {
      console.error('Error fetching LLM requests:', err);
      return [];
    }
  }

  /**
   * Creates a button to toggle showing request/response details
   * for a specific LLM iteration.
   */
  function createShowRequestButton(iteration) {
    const button = document.createElement('button');
    button.className = 'llm-details-button';
    button.innerText = 'Toggle Details On';

    const detailsContainer = document.createElement('div');
    detailsContainer.className = 'llm-details-container';

    const matchingRequest = llmRequestsData.find(r => r.iteration === iteration);
    if (matchingRequest) {
      // Build a request section
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

      // Build a response section
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

  /**
   * Renders the main chat area with messages, including iteration-based detail toggles
   * for assistant messages that may correspond to tool calls or requests.
   */
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
      
      // Add role header
      const roleText = document.createElement('strong');
      roleText.textContent = msg.role.toUpperCase() + ': ';
      div.appendChild(roleText);

      if (msg.role === 'assistant' && msg.content.includes('</think>')) {
        // Parse XML tags for assistant messages that contain XML tags
        const content = msg.content.replace(/\n/g, ' ');
        const tags = {
          think: content.match(/<think>(.*?)<\/think>/)?.[1] || '',
          plan: content.match(/<plan>(.*?)<\/plan>/)?.[1] || '',
          speak: content.match(/<speak>(.*?)<\/speak>/)?.[1] || ''
        };

        if (tags.think) {
          const thinkHeader = document.createElement('div');
          thinkHeader.className = 'tag-header';
          thinkHeader.textContent = 'THINK:';
          div.appendChild(thinkHeader);

          const thinkContent = document.createElement('div');
          thinkContent.className = 'tag-content';
          thinkContent.textContent = tags.think.trim();
          div.appendChild(thinkContent);
        }

        if (tags.plan) {
          const planHeader = document.createElement('div');
          planHeader.className = 'tag-header';
          planHeader.textContent = 'PLAN:';
          div.appendChild(planHeader);

          const planContent = document.createElement('div');
          planContent.className = 'tag-content';
          planContent.textContent = tags.plan.trim();
          div.appendChild(planContent);
        }

        if (tags.speak) {
          const speakHeader = document.createElement('div');
          speakHeader.className = 'tag-header';
          speakHeader.textContent = 'SPEAK:';
          div.appendChild(speakHeader);

          const speakContent = document.createElement('div');
          speakContent.className = 'tag-content';
          speakContent.textContent = tags.speak.trim();
          div.appendChild(speakContent);
        }
      } else if (msg.content.includes('[ SYSTEM ]') && msg.content.includes('AGENT (YOU) EXECUTED THE TOOL')) {
        // Parse tool execution message
        const lines = msg.content.split('\n').filter(line => line.trim()); // Remove empty lines
        const toolMatch = lines.find(line => line.includes('EXECUTED THE TOOL'))?.match(/EXECUTED THE TOOL (\w+)/);
        const toolName = toolMatch ? toolMatch[1] : 'unknown';
        
        // Find the parameters and result sections
        const paramsStart = lines.findIndex(line => line.trim() === 'PARAMETERS:');
        const resultStart = lines.findIndex(line => line.trim() === 'RESULT:');
        
        if (paramsStart !== -1 && resultStart !== -1) {
          const params = lines.slice(paramsStart + 1, resultStart).join('\n');
          const result = lines.slice(resultStart + 1).join('\n');

          // Create tool execution header
          const toolHeader = document.createElement('div');
          toolHeader.className = 'tag-header tool-header';
          toolHeader.textContent = `TOOL EXECUTION: ${toolName}`;
          div.appendChild(toolHeader);

          // Create parameters section
          const paramsHeader = document.createElement('div');
          paramsHeader.className = 'tag-header';
          paramsHeader.textContent = 'PARAMETERS:';
          div.appendChild(paramsHeader);

          const paramsContent = document.createElement('pre');
          paramsContent.className = 'tag-content tool-content';
          try {
            const formattedParams = JSON.stringify(JSON.parse(params.trim()), null, 2);
            paramsContent.textContent = formattedParams;
          } catch (e) {
            paramsContent.textContent = params.trim();
          }
          div.appendChild(paramsContent);

          // Create result section
          const resultHeader = document.createElement('div');
          resultHeader.className = 'tag-header';
          resultHeader.textContent = 'RESULT:';
          div.appendChild(resultHeader);

          const resultContent = document.createElement('pre');
          resultContent.className = 'tag-content tool-content';
          try {
            const formattedResult = JSON.stringify(JSON.parse(result.trim()), null, 2);
            resultContent.textContent = formattedResult;
          } catch (e) {
            resultContent.textContent = result.trim();
          }
          div.appendChild(resultContent);
        }
      } else {
        // For non-XML messages, render content normally including HTML
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = renderMessageContent(msg.content);
        div.appendChild(contentDiv);
      }
      
      msgGroup.appendChild(div);

      // If it's an assistant message, attach a toggle button for request details
      if (msg.role === 'assistant') {
        assistantCounter++;
        const { button, detailsContainer } = createShowRequestButton(assistantCounter);
        msgGroup.appendChild(button);
        msgGroup.appendChild(detailsContainer);
      }

      chatArea.appendChild(msgGroup);
    });
  }

  /**
   * Renders the chat history in the sidebar.
   */
  function renderChatHistory(messages) {
    chatHistoryContainer.innerHTML = '';
    if (!messages || messages.length === 0) {
      chatHistoryContainer.textContent = 'No chat history';
      return;
    }
    messages.forEach(msg => {
      const div = document.createElement('div');
      div.classList.add('chat-message', msg.role);
      
      // Create role text
      const roleText = document.createTextNode(msg.role.toUpperCase() + ': ');
      div.appendChild(roleText);
      
      if (msg.role === 'assistant' && msg.content.includes('</think>')) {
        // Keep XML tags as text for assistant messages with XML
        const contentSpan = document.createElement('span');
        contentSpan.textContent = msg.content.replace(/\n/g, ' ');
        div.appendChild(contentSpan);
      } else {
        // For non-XML messages, render content normally including HTML
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = renderMessageContent(msg.content);
        div.appendChild(contentDiv);
      }
      
      chatHistoryContainer.appendChild(div);
    });
  }

  /**
   * Renders the list of agent tabs. Highlights the current agent.
   */
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
        
        // Load from cache first
        const cachedAgent = activeAgents.get(a.id);
        if (cachedAgent) {
          systemPromptDisplay.textContent = cachedAgent.systemPrompt;
          llmRequestsData = cachedAgent.llmRequests || [];
          renderChatHistory(cachedAgent.chatHistory);
          renderMainChat(cachedAgent.chatHistory);
        }
        
        refreshAgentData();
      });
      agentTabs.appendChild(tab);
    });
  }

  /**
   * Fetches updated data for the current agent
   * and updates the UI to reflect the latest state.
   */
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

  /**
   * Fetches agents and selects the first if none is currently selected.
   */
  async function refreshAgentsAndSelectIfNone() {
    const agents = await fetchAgents();
    if (!currentAgentId && agents.length > 0) {
      currentAgentId = agents[0].id;
    }
    renderAgentTabs(agents);
    refreshAgentData();
  }

  // Initialize the agent list and select the first one (if available)
  (async () => {
    const agents = await fetchAgents();
    if (agents.length > 0) {
      currentAgentId = agents[0].id;
    }
    renderAgentTabs(agents);
    refreshAgentData();
  })();

  // Send user messages to the current agent
  if (sendMessageButton) {
    sendMessageButton.addEventListener('click', async () => {
      if (!currentAgentId) return;
      const msg = userMessageInput.value.trim();
      userMessageInput.value = '';
      if (!msg) return;
      try {
        const encodedId = encodeURIComponent(currentAgentId);
        await fetch(`/agent/${encodedId}/message`, {
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

  // Send on Enter key
  if (userMessageInput) {
    userMessageInput.addEventListener('keyup', (e) => {
      if (e.key === 'Enter') {
        sendMessageButton.click();
      }
    });
  }
});