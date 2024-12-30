import { EventEmitter } from 'events';
import { FeatherAgent } from '../core/FeatherAgent';

interface AgentInfo {
  id: string;
  agentInstance: FeatherAgent;
  systemPrompt: string;
  chatHistory: any[];
  lastError: string | null;
  aiResponse: string | null;
  logs: string[];
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
    const agentInfo: AgentInfo = {
      id: agentId,
      agentInstance,
      systemPrompt: agentInstance['config']?.systemPrompt || '',
      chatHistory: agentInstance.getMessages() || [],
      aiResponse: null,
      lastError: null,
      logs: []
    };
    this.agents.set(agentId, agentInfo);
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
      this.emit('systemPromptUpdated', { agentId, prompt });
    }
  }

  public updateChatHistory(agentId: string, messages: any[]) {
    const agentInfo = this.agents.get(agentId);
    if (agentInfo) {
      agentInfo.chatHistory = messages;
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
}

export const agentEventBus = AgentEventBus.getInstance();