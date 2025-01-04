export type Role = 'system' | 'assistant' | 'user' | 'tool';

/**
 * Represents a message within the conversation flow.
 * Each message is associated with a role and optional content.
 */
export interface Message {
  role: Role;
  content?: string | ContentPart[];
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

// New types for content parts
export interface TextContent {
  type: 'text';
  text: string;
}

export interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;
    detail?: string;
  };
}

export type ContentPart = TextContent | ImageContent;

/**
 * OpenRouter specific parameters for controlling model behavior.
 * Documentation: https://openrouter.ai/docs/parameters
 */
export interface OpenRouterParameters {
  /** Temperature (0.0 to 2.0) - Controls response variety. Default: 1.0 */
  temperature?: number;
  
  /** Top P (0.0 to 1.0) - Limits token choices to top percentage. Default: 1.0 */
  top_p?: number;
  
  /** Top K (0 or above) - Limits token choices to top K options. Default: 0 */
  top_k?: number;
  
  /** Frequency Penalty (-2.0 to 2.0) - Adjusts frequency-based token repetition. Default: 0.0 */
  frequency_penalty?: number;
  
  /** Presence Penalty (-2.0 to 2.0) - Adjusts presence-based token repetition. Default: 0.0 */
  presence_penalty?: number;
  
  /** Repetition Penalty (0.0 to 2.0) - Reduces input token repetition. Default: 1.0 */
  repetition_penalty?: number;
  
  /** Min P (0.0 to 1.0) - Minimum token probability threshold. Default: 0.0 */
  min_p?: number;
  
  /** Top A (0.0 to 1.0) - Dynamic token filtering based on highest probability. Default: 0.0 */
  top_a?: number;
  
  /** Seed (integer) - For deterministic sampling */
  seed?: number;
  
  /** Max Tokens (1 or above) - Maximum tokens to generate */
  max_tokens?: number;
  
  /** Logit Bias - Token ID to bias value (-100 to 100) mapping */
  logit_bias?: Record<string, number>;
  
  /** Return log probabilities of output tokens */
  logprobs?: boolean;
  
  /** Number of most likely tokens (0-20) to return per position */
  top_logprobs?: number;

  /** Controls tool calling behavior:
   * - 'none': Model will not call any tool, only generates message
   * - 'auto': Model can choose between message or tool calls
   * - 'required': Model must call one or more tools
   * Can also specify a particular tool via {type: "function", function: {name: "my_function"}} */
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function', function: { name: string } };

  /** Enable or disable parallel tool calls (default is true) */
  parallel_tool_calls?: boolean;
}
