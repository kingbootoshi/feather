import { FeatherAgent } from '../core/FeatherAgent';
import { ToolDefinition } from '../types/types';
import { logger } from '../logger/logger';

// THIS TEST REQUIRES A PERPLEXITY API KEY
// You can get one at https://www.perplexity.ai/


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
const internetTool: ToolDefinition = {
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

async function main() {
  // Check for Perplexity API key
  if (!process.env.PERPLEXITY_API_KEY) {
    logger.error("No Perplexity API key found. Please set PERPLEXITY_API_KEY in your .env file");
    logger.info("You can get a Perplexity API key at https://www.perplexity.ai/");
    return;
  }

  // Create an internet research agent that auto-executes searches
  const internetAgent = new FeatherAgent({
    agentId: "internet-researcher",
    systemPrompt: "You are a research assistant who can search the internet for up-to-date information. Always cite your sources and provide detailed, accurate responses.",
    tools: [internetTool],
    cognition: true,
    model: "deepseek/deepseek-chat",
    chainRun: true,
    maxChainIterations: 10,
    debug: true,
  });

  try {
    // Test the agent with a current events query
    const res = await internetAgent.run("Search the internet for information on Nvidia black well GPUs, then get information on deepseek, then give me a long, detailed essay on how much the new GPUs can amplify deepseek models and how it'll help accelearte the GDP");
    if (!res.success) {
      logger.error(`Agent error: ${res.error || 'unknown'}`);
      return;
    }

    logger.info({ output: res.output }, "Internet Agent response");
  } catch (error) {
    logger.error({ error }, "Fatal error running internetAgent");
  } 
}

// Run if called directly
if (require.main === module) {
  logger.debug('Starting internet search test');
  main().catch(err => logger.error({ err }, "Error running internet search test"));
}