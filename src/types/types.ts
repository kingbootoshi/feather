export type Role = 'system' | 'assistant' | 'user' | 'tool';

export interface Message {
  role: Role;
  content?: string;
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
  execute: (args: Record<string, any>) => Promise<any>;
}

export interface FunctionCall {
  functionName: string;
  functionArgs: Record<string, any>;
}

export interface AgentRunResult {
  success: boolean;
  output: string | Record<string, any>;
  error?: string;
  functionCalls?: FunctionCall[];
}