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
 * TOutput is a generic representing the structured output type if used,
 * or a string/Record<string, any> by default.
 */
export interface AgentRunResult<TOutput = string | Record<string, any>> {
  success: boolean;
  output: TOutput;
  error?: string;
  functionCalls?: FunctionCall[];
}