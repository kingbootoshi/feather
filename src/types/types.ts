export type Role = 'system' | 'assistant' | 'user' | 'tool';

/**
 * Represents a message within the conversation flow.
 * Each message is associated with a role and optional content.
 */
export interface Message {
  role: Role;
  content?: string;
  name?: string;
}

/**
 * Describes a tool definition that the agent can use.
 * Includes metadata for function calling and the actual execute() implementation.
 */
export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
  execute: (args: Record<string, any>) => Promise<any>;
}

/**
 * Encapsulates a function call request, including the function name and arguments.
 */
export interface FunctionCall {
  functionName: string;
  functionArgs: Record<string, any>;
}

/**
 * Represents the result of an Agent run.
 * success indicates if the agent reached a conclusion, output holds the final data,
 * error contains any error message, and functionCalls track invoked tools.
 */
export interface AgentRunResult {
  success: boolean;
  output: string | Record<string, any>;
  error?: string;
  functionCalls?: FunctionCall[];
}