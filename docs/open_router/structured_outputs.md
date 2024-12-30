Structured Outputs
OpenRouter supports structured outputs for compatible models, ensuring responses follow a specific JSON Schema format. This feature is particularly useful when you need consistent, well-formatted responses that can be reliably parsed by your application.

Overview
Structured outputs allow you to:

Enforce specific JSON Schema validation on model responses
Get consistent, type-safe outputs
Avoid parsing errors and hallucinated fields
Simplify response handling in your application
Using Structured Outputs
To use structured outputs, include a response_format parameter in your request, with type set to json_schema and the json_schema object containing your schema:

typescript

{
  "messages": [
    { "role": "user", "content": "What's the weather like in London?" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "weather",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "location": {
            "type": "string",
            "description": "City or location name"
          },
          "temperature": {
            "type": "number",
            "description": "Temperature in Celsius"
          },
          "conditions": {
            "type": "string",
            "description": "Weather conditions description"
          }
        },
        "required": ["location", "temperature", "conditions"],
        "additionalProperties": false
      }
    }
  }
}
The model will respond with a JSON object that strictly follows your schema:

json

{
  "location": "London",
  "temperature": 18,
  "conditions": "Partly cloudy with light drizzle"
}
Model Support
Structured outputs are supported by select models, including:

You can find a list of models that support structured outputs on the models page.

OpenAI models (GPT-4o and later versions) Docs
All Fireworks provided models Docs
To ensure your chosen model supports structured outputs:

Check the model's supported parameters on the models page
Set require_parameters: true in your provider preferences (see Provider Routing)
Include ResponseFormat and set type: json_schema in the required parameters
Best Practices
Include descriptions: Add clear descriptions to your schema properties to guide the model

Use strict mode: Always set strict: true to ensure the model follows your schema exactly

Example Implementation
Here's a complete example using the Fetch API:

typescript

const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer YOUR_API_KEY',
    'HTTP-Referer': 'https://your-app.com',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4',
    messages: [
      { role: 'user', content: 'What is the weather like in London?' },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'weather',
        strict: true,
        schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'City or location name',
            },
            temperature: {
              type: 'number',
              description: 'Temperature in Celsius',
            },
            conditions: {
              type: 'string',
              description: 'Weather conditions description',
            },
          },
          required: ['location', 'temperature', 'conditions'],
          additionalProperties: false,
        },
      },
    },
  }),
});

const data = await response.json();
const weatherInfo = data.choices[0].message.content;
Streaming with Structured Outputs
Structured outputs are also supported with streaming responses. The model will stream valid partial JSON that, when complete, forms a valid response matching your schema.

To enable streaming with structured outputs, simply add stream: true to your request:

typescript

{
  "stream": true,
  "response_format": {
    "type": "json_schema",
    // ... rest of your schema
  }
}
Error Handling
When using structured outputs, you may encounter these scenarios:

Model doesn't support structured outputs: The request will fail with an error indicating lack of support
Invalid schema: The model will return an error if your JSON Schema is invalid