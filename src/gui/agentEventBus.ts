import { EventEmitter } from 'events';
import { FeatherAgent } from '../core/FeatherAgent';

interface LlmRequestRecord {
  iteration: number;
  requestData: any;
  responseData?: any;
}

interface AgentInfo {
  id: string;
  agentInstance: FeatherAgent;
  systemPrompt: string;
  chatHistory: any[];
  lastError: string | null;
  aiResponse: string | null;
  logs: string[];
  llmRequests: LlmRequestRecord[];
  lastActive: number;
}

/**
 * AgentEventBus uses an EventEmitter to track all active agents,
 * store their system prompts, chat histories, logs, and LLM requests.
 * Components like the debug GUI subscribe to these events.
 */
class AgentEventBus extends EventEmitter {
  private agents: Map<string, AgentInfo> = new Map();
  private static instance: AgentEventBus;
  
  private constructor() {
    super();
  }

  public static getInstance(): AgentEventBus {
    if (!AgentEventBus.instance) {
      AgentEventBus.instance = new AgentEventBus();
    }
    return AgentEventBus.instance;
  }

  /**
   * Register a new agent or update an existing agent's record.
   * @param agentId Unique identifier for the agent.
   * @param agentInstance The FeatherAgent instance.
   */
  public registerAgent(agentId: string, agentInstance: FeatherAgent) {
    // Clean the agent ID to ensure consistent lookup
    const cleanId = decodeURIComponent(agentId);
    const existingAgent = this.agents.get(cleanId);
    
    const agentInfo: AgentInfo = {
      id: cleanId,
      agentInstance,
      systemPrompt: agentInstance['config']?.systemPrompt || '',
      chatHistory: agentInstance.getMessages() || [],
      aiResponse: null,
      lastError: null,
      logs: [],
      llmRequests: [],
      lastActive: Date.now()
    };
    
    // If agent already exists, keep existing logs and LLM requests
    if (existingAgent) {
      agentInfo.chatHistory = existingAgent.chatHistory;
      agentInfo.llmRequests = existingAgent.llmRequests;
      agentInfo.logs = existingAgent.logs;
    }
    
    this.agents.set(cleanId, agentInfo);
    this.emit('newAgentSession', { agent: agentInfo });
  }

  /**
   * Retrieve agent information by ID.
   * @param agentId ID of the agent to fetch.
   */
  public getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Return an array of all known agents.
   */
  public getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  /**
   * Update the system prompt for a given agent and emit an event.
   */
  public updateSystemPrompt(agentId: string, prompt: string) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.systemPrompt = prompt;
      agentInfo.lastActive = Date.now();
      this.emit('systemPromptUpdated', { agentId, prompt });
    }
  }

  /**
   * Update the chat history for a given agent and emit an event.
   */
  public updateChatHistory(agentId: string, messages: any[]) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.chatHistory = messages;
      agentInfo.lastActive = Date.now();
      this.emit('chatHistoryUpdated', { agentId, messages });
    }
  }

  /**
   * Store the final AI response for a given agent and emit an event.
   */
  public updateAgentResponse(agentId: string, response: string) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.aiResponse = response;
      this.emit('aiResponseUpdated', { agentId, response });
    }
  }

  /**
   * Record any errors encountered by an agent and emit an event.
   */
  public updateAgentError(agentId: string, error: string) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.lastError = error;
      this.emit('agentError', { agentId, error });
    }
  }

  /**
   * Update the logs for a given agent and emit an event.
   */
  public updateAgentLog(agentId: string, logs: string[]) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.logs = logs;
      this.emit('agentLogsUpdated', { agentId, logs });
    }
  }

  /**
   * Store a new LLM request object in the agent info and broadcast an update.
   */
  public storeLlmRequest(agentId: string, record: { iteration: number; requestData: any }) {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) return;
    
    agentInfo.llmRequests.push({
      iteration: record.iteration,
      requestData: record.requestData
    });
    
    this.emit('llmRequestsUpdated', { 
      agentId, 
      requests: agentInfo.llmRequests 
    });
  }

  /**
   * Store the LLM response for a specific iteration request
   * and broadcast the updated requests array.
   */
  public storeLlmResponse(agentId: string, iteration: number, record: { responseData: any }) {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) return;

    const existing = agentInfo.llmRequests.find(r => r.iteration === iteration);
    if (existing) {
      existing.responseData = record.responseData;
      this.emit('llmRequestsUpdated', { 
        agentId, 
        requests: agentInfo.llmRequests 
      });
    }
  }

  /**
   * Returns agents that have been active within the last hour (for demonstration).
   */
  public getActiveAgents(): AgentInfo[] {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return Array.from(this.agents.values())
      .filter(agent => agent.lastActive > oneHourAgo);
  }
}

export const agentEventBus = AgentEventBus.getInstance();