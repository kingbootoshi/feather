Errors
For errors, OpenRouter returns a JSON response with the following shape:

typescript

type ErrorResponse = {
  error: {
    code: number;
    message: string;
    metadata?: Record<string, unknown>;
  };
};
The HTTP Response will have the same status code as error.code, forming a request error if:

Your original request is invalid
Your API key/account is out of credits
Otherwise, the returned HTTP response status will be 200 and any error occured while the LLM is producing the output will be emitted in the response body or as an SSE data event.

Example code for printing errors in JavaScript:

javascript

const request = await fetch('https://openrouter.ai/...');
console.log(request.status); // Will be an error code unless the model started processing your request
const response = await request.json();
console.error(response.error?.status); // Will be an error code
console.error(response.error?.message);
Error Codes
400: Bad Request (invalid or missing params, CORS)
401: Invalid credentials (OAuth session expired, disabled/invalid API key)
402: Your account or API key has insufficient credits. Add more credits and retry the request.
403: Your chosen model requires moderation and your input was flagged
408: Your request timed out
429: You are being rate limited
502: Your chosen model is down or we received an invalid response from it
503: There is no available model provider that meets your routing requirements
Moderation Errors
If your input was flagged, the error.metadata will contain information about the issue. The shape of the metadata is as follows:

typescript

type ModerationErrorMetadata = {
  reasons: string[]; // Why your input was flagged
  flagged_input: string; // The text segment that was flagged, limited to 100 characters. If the flagged input is longer than 100 characters, it will be truncated in the middle and replaced with ...

  provider_name: string; // The name of the provider that requested moderation
  model_slug: string;
};
Provider Errors
If the model provider encounters an error, the error.metadata will contain information about the issue. The shape of the metadata is as follows:

typescript

type ProviderErrorMetadata = {
  provider_name: string; // The name of the provider that encountered the error
  raw: unknown; // The raw error from the provider
};
When No Content is Generated
Occasionally, the model may not generate any content. This typically occurs when:

The model is warming up from a cold start
The system is scaling up to handle more requests
Warm-up times usually range from a few seconds to a few minutes, depending on the model and provider.

If you encounter persistent no-content issues, consider implementing a simple retry mechanism or trying again with a different provider or model that has more recent activity.

Additionally, be aware that in some cases, you may still be charged for the prompt processing cost by the upstream provider, even if no content is generated.