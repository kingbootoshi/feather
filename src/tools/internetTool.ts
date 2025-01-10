// Internet search tool using Perplexity API
import { ToolDefinition } from '../types/types';
import { logger } from '../logger/logger';

// Define interfaces for Perplexity API
interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface PerplexityResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

// Helper function to query Perplexity API
async function queryPerplexity(query: string): Promise<string> {

    // Check for Perplexity API key
  if (!process.env.PERPLEXITY_API_KEY) {
    logger.error("No Perplexity API key found. Please set PERPLEXITY_API_KEY in your .env file");
    logger.info("You can get a Perplexity API key at https://www.perplexity.ai/");
    throw new Error("No Perplexity API key found. Please set PERPLEXITY_API_KEY in your .env file");
  }

  const messages: Message[] = [
    {
      role: 'system',
      content: 'Give a clear, direct answer to the user\'s question.'
    },
    {
      role: 'user',
      content: query
    }
  ];

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.PERPLEXITY_API_KEY}`
    },
    body: JSON.stringify({
      model: 'llama-3.1-sonar-large-128k-online',
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`API request failed with status ${response.status}`);
  }

  const data = (await response.json()) as PerplexityResponse;
  return data.choices[0].message.content;
}

// Internet search tool using Perplexity API
// Allows the agent to search the internet and get AI-powered responses
export const internetTool: ToolDefinition = {
  type: "function",
  function: {
    name: "search_internet",
    description: "Search the internet for up-to-date information using Perplexity AI",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to look up information about"
        }
      },
      required: ["query"]
    }
  },
  // Execute function that calls Perplexity API and handles responses
  async execute(args: Record<string, any>): Promise<{ result: string }> {
    logger.info({ args }, "Executing internet search tool");
    
    try {
      const params = typeof args === 'string' ? JSON.parse(args) : args;
      if (typeof params.query !== 'string') {
        throw new Error("Query must be a valid string");
      }

      // Call Perplexity API to get search results
      const searchResult = await queryPerplexity(params.query);
      return { result: searchResult };

    } catch (error) {
      logger.error({ error, args }, "Internet search tool error");
      throw error;
    }
  }
}; 