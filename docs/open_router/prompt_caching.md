Prompt Caching
To save on inference costs, you can enable prompt caching on supported providers and models.

Most providers automatically enable prompt caching, but note that some (see Anthropic below) require you to enable it on a per-message basis. Note that prompt caching does not work when switching between providers. In order to cache the prompt, LLM engines must store a memory snapshot of the processed prompt, which is not shared with other providers.

Inspecting cache usage
To see how much caching saved on each generation, you click the detail button on the Activity page, or you can use the /api/v1/generation API, documented here.

The cache_discount field in the response body will tell you how much the response saved on cache usage. Some providers, like Anthropic, will have a negative discount on cache writes, but a positive discount (which reduces total cost) on cache reads.

OpenAI
Caching price changes:

Cache writes: no cost
Cache reads: charged at 0.5x the price of the original input pricing on average
Supported models

openai/gpt-4o
openai/gpt-4o-2024-08-06
openai/gpt-4o-2024-11-20
openai/gpt-4o-mini
openai/gpt-4o-mini-2024-07-18
openai/o1-preview
openai/o1-preview-2024-09-12
openai/o1-mini
openai/o1-mini-2024-09-12
openai/o1-2024-12-17
Prompt caching with OpenAI is automated and does not require any additional configuration. There is a minimum prompt size of 1024 tokens.

Click here to read more about OpenAI prompt caching and its limitation.

Anthropic Claude
Caching price changes:

Cache writes: charged at 1.25x the price of the original input pricing
Cache reads: charged at 0.1x the price of the original input pricing
Supported models:

anthropic/claude-3-opus
anthropic/claude-3-sonnet
anthropic/claude-3.5-sonnet
anthropic/claude-3.5-sonnet-20240620
anthropic/claude-3-haiku
anthropic/claude-3-5-haiku
anthropic/claude-3-5-haiku-20241022
anthropic/claude-3-opus:beta
anthropic/claude-3-sonnet:beta
anthropic/claude-3.5-sonnet:beta
anthropic/claude-3.5-sonnet-20240620:beta
anthropic/claude-3-haiku:beta
anthropic/claude-3-5-haiku:beta
anthropic/claude-3-5-haiku-20241022:beta
Prompt caching with Anthropic requires the use of cache_control breakpoints. There is a limit of four breakpoints, and the cache will expire within five minutes. Therefore, it is recommended to reserve the cache breakpoints for large bodies of text, such as character cards, CSV data, RAG data, book chapters, etc.

Click here to read more about Anthropic prompt caching and its limitation.

The cache_control breakpoint can only be inserted into the text part of a multipart message.

System message caching example:

json

Copy
{
  "messages": [
    {
      "role": "system",
      "content": [
        {
          "type": "text",
          "text": "You are a historian studying the fall of the Roman Empire. You know the following book very well:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY",
          "cache_control": {
            "type": "ephemeral"
          }
        }
      ]
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "What triggered the collapse?"
        }
      ]
    }
  ]
}
User message caching example:

json

Copy
{
  "messages": [
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Given the book below:"
        },
        {
          "type": "text",
          "text": "HUGE TEXT BODY",
          "cache_control": {
            "type": "ephemeral"
          }
        },
        {
          "type": "text",
          "text": "Name all the characters in the above book"
        }
      ]
    }
  ]
}
DeepSeek
Caching price changes:

Cache writes: charged at the same price as the original input pricing
Cache reads: charged at 0.1x the price of the original input pricing
Prompt caching with DeepSeek is automated and does not require any additional configuration.