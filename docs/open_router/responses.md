Responses
Responses are largely consistent with the OpenAI Chat API. This means that choices is always an array, even if the model only returns one completion. Each choice will contain a delta property if a stream was requested and a message property otherwise. This makes it easier to use the same code for all models.

At a high level, OpenRouter normalizes the schema across models and providers so you only need to learn one.

Response Body
Note that finish_reason will vary depending on the model provider. The model property tells you which model was used inside the underlying API.

Here's the response schema as a TypeScript type:

typescript

// Definitions of subtypes are below

type Response = {
  id: string;
  // Depending on whether you set "stream" to "true" and
  // whether you passed in "messages" or a "prompt", you
  // will get a different output shape
  choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[];
  created: number; // Unix timestamp
  model: string;
  object: 'chat.completion' | 'chat.completion.chunk';

  system_fingerprint?: string; // Only present if the provider supports it

  // Usage data is always returned for non-streaming.
  // When streaming, you will get one usage object at
  // the end accompanied by an empty choices array.
  usage?: ResponseUsage;
};
typescript

Copy
// If the provider returns usage, we pass it down
// as-is. Otherwise, we count using the GPT-4 tokenizer.

type ResponseUsage = {
  /** Including images and tools if any */
  prompt_tokens: number;
  /** The tokens generated */
  completion_tokens: number;
  /** Sum of the above two fields */
  total_tokens: number;
}
typescript

// Subtypes:
type NonChatChoice = {
  finish_reason: string | null;
  text: string;
  error?: ErrorResponse;
};

type NonStreamingChoice = {
  finish_reason: string | null; // Depends on the model. Ex: 'stop' | 'length' | 'content_filter' | 'tool_calls'
  message: {
    content: string | null;
    role: string;
    tool_calls?: ToolCall[];
  };
  error?: ErrorResponse;
};

type StreamingChoice = {
  finish_reason: string | null;
  delta: {
    content: string | null;
    role?: string;
    tool_calls?: ToolCall[];
  };
  error?: ErrorResponse;
};

type ErrorResponse = {
  code: number; // See "Error Handling" section
  message: string;
  metadata?: Record<string, unknown>; // Contains additional error information such as provider details, the raw error message, etc.
};

type ToolCall = {
  id: string;
  type: 'function';
  function: FunctionCall;
};
Here's an example:

json

{
  "id": "gen-xxxxxxxxxxxxxx",
  "choices": [
    {
      "finish_reason": "stop", // Different models provide different reasons here
      "message": {
        // will be "delta" if streaming
        "role": "assistant",
        "content": "Hello there!"
      }
    }
  ],
  "usage": {
    "prompt_tokens": 0,
    "completion_tokens": 4,
    "total_tokens": 4
  },
  "model": "openai/gpt-3.5-turbo" // Could also be "anthropic/claude-2.1", etc, depending on the "model" that ends up being used
}
Querying Cost and Stats
The token counts that are returned in the completions API response are NOT counted with the model's native tokenizer. Instead it uses a normalized, model-agnostic count.

For precise token accounting using the model's native tokenizer, use the /api/v1/generation endpoint.

You can use the returned id to query for the generation stats (including token counts and cost) after the request is complete. This is how you can get the cost and tokens for all models and requests, streaming and non-streaming.

javascript

const generation = await fetch(
  "https://openrouter.ai/api/v1/generation?id=$GENERATION_ID",
  { headers }
)

await generation.json()
// OUTPUT:
{
  data: {
    "id": "gen-nNPYi0ZB6GOK5TNCUMHJGgXo",
    "model": "openai/gpt-4-32k",
    "streamed": false,
    "generation_time": 2,
    "created_at": "2023-09-02T20:29:18.574972+00:00",
    "tokens_prompt": 24,
    "tokens_completion": 29,
    "native_tokens_prompt": 24,
    "native_tokens_completion": 29,
    "num_media_prompt": null,
    "num_media_completion": null,
    "origin": "https://localhost:47323/",
    "total_cost": 0.00492,
    "cache_discount": null,
    ...
  }
};
Note that token counts are also available in the usage field of the response body for non-streaming completions.

SSE Streaming Comments
For SSE streams, we occasionally need to send an SSE comment to indicate that OpenRouter is processing your request. This helps prevent connections from timing out. The comment will look like this:


Copy
: OPENROUTER PROCESSING
Comment payload can be safely ignored per the SSE specs. However, you can leverage it to improve UX as needed, e.g. by showing a dynamic loading indicator.

Some SSE client implementations might not parse the payload according to spec, which leads to an uncaught error when you JSON.stringify the non-JSON payloads. We recommend the following clients: