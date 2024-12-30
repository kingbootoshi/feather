Model Routing
Multi-model routing is under development 👀

In the meantime, OpenRouter provides two options:

The Auto router, a special model ID that you can use to choose between selected high-quality models based on heuristics applied to your prompt.

The models array, which lets you automatically try other models if the primary model's providers are down, rate-limited, or refuse to reply due to content moderation required by all providers:

json

{
  "models": ["anthropic/claude-2.1", "gryphe/mythomax-l2-13b"],
  "route": "fallback",
  ... // Other params
}
If the model you selected returns an error, OpenRouter will try to use the fallback model instead. If the fallback model is down or returns an error, OpenRouter will return that error.

By default, any error can trigger the use of a fallback model, including context length validation errors, moderation flags for filtered models, rate-limiting, and downtime.

Requests are priced using the model that was used, which will be returned in the model attribute of the response body.

If no fallback model is specified but route: "fallback" is still included, OpenRouter will try the most appropriate open-source model available, with pricing less than the primary model (or very close to it).