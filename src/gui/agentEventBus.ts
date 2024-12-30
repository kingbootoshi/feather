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
    
    if (existingAgent) {
      agentInfo.chatHistory = existingAgent.chatHistory;
      agentInfo.llmRequests = existingAgent.llmRequests;
      agentInfo.logs = existingAgent.logs;
    }
    
    this.agents.set(cleanId, agentInfo);
    this.emit('newAgentSession', { agent: agentInfo });
  }

  public getAgent(agentId: string): AgentInfo | undefined {
    return this.agents.get(agentId);
  }

  public getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values());
  }

  public updateSystemPrompt(agentId: string, prompt: string) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.systemPrompt = prompt;
      agentInfo.lastActive = Date.now();
      this.emit('systemPromptUpdated', { agentId, prompt });
    }
  }

  public updateChatHistory(agentId: string, messages: any[]) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.chatHistory = messages;
      agentInfo.lastActive = Date.now();
      this.emit('chatHistoryUpdated', { agentId, messages });
    }
  }

  public updateAgentResponse(agentId: string, response: string) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.aiResponse = response;
      this.emit('aiResponseUpdated', { agentId, response });
    }
  }

  public updateAgentError(agentId: string, error: string) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.lastError = error;
      this.emit('agentError', { agentId, error });
    }
  }

  public updateAgentLog(agentId: string, logs: string[]) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.logs = logs;
      this.emit('agentLogsUpdated', { agentId, logs });
    }
  }

  /**
   * Store a new LLM request object in the agent info.
   */
  public storeLlmRequest(agentId: string, record: { iteration: number; requestData: any }) {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) return;
    
    agentInfo.llmRequests.push({
      iteration: record.iteration,
      requestData: record.requestData
    });
    
    // Emit event with the full requests array
    this.emit('llmRequestsUpdated', { 
      agentId, 
      requests: agentInfo.llmRequests 
    });
  }

  /**
   * Store the LLM response object for the specific iteration request.
   */
  public storeLlmResponse(agentId: string, iteration: number, record: { responseData: any }) {
    const agentInfo = this.agents.get(agentId);
    if (!agentInfo) return;

    // Find the request record with matching iteration
    const existing = agentInfo.llmRequests.find(r => r.iteration === iteration);
    if (existing) {
      existing.responseData = record.responseData;
      
      // Emit event with the full requests array
      this.emit('llmRequestsUpdated', { 
        agentId, 
        requests: agentInfo.llmRequests 
      });
    }
  }

  public getActiveAgents(): AgentInfo[] {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return Array.from(this.agents.values())
      .filter(agent => agent.lastActive > oneHourAgo);
  }
}

export const agentEventBus = AgentEventBus.getInstance();