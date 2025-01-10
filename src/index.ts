/**
 * Main exports for the Feather framework
 */

// Core exports
export { FeatherAgent } from './core/FeatherAgent';

// Type exports
export {
  Message,
  ToolDefinition,
  FunctionCall,
  AgentRunResult,
  ContentPart,
  OpenRouterParameters,
  ImageContent,
  TextContent
} from './types/types';

// Tool exports
export * from './tools';

// Re-export logger for users who want to use it
export { logger } from './logger/logger';