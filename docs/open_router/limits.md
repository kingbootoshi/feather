Limits
Rate Limits and Credits Remaining
To check the rate limit or credits left on an API key, make a GET request to https://openrouter.ai/api/v1/auth/key.

javascript

fetch('https://openrouter.ai/api/v1/auth/key', {
  method: 'GET',
  headers: {
    Authorization: 'Bearer $OPENROUTER_API_KEY',
  },
});
If you submit a valid API key, you should get a response of the form:

typescript

type Key = {
  data: {
    label: string;
    usage: number; // Number of credits used
    limit: number | null; // Credit limit for the key, or null if unlimited
    is_free_tier: boolean; // Whether the user has paid for credits before
    rate_limit: {
      requests: number; // Number of requests allowed...
      interval: string; // in this interval, e.g. "10s"
    };
  };
};
There are a few rate limits that apply to certain types of requests, regardless of account status:

Free limit: If you are using a free model variant (with an ID ending in :free), then you will be limited to 20 requests per minute and 200 requests per day.

DDoS protection: Cloudflare's DDoS protection will block requests that dramatically exceed reasonable usage.

For all other requests, rate limits are a function of the number of credits remaining on the key or account. Partial credits round up in your favor. For the credits available on your API key, you can make 1 request per credit per second up to the surge limit (typically 500 requests per second, but you can go higher).

For example:

0.5 credits → 1 req/s (minimum)
5 credits → 5 req/s
10 credits → 10 req/s
500 credits → 500 req/s
1000 credits → Contact us if you see ratelimiting from OpenRouter
If your account has a negative credit balance, you may see 402 errors, including for free models. Adding credits to put your balance above zero allows you to use those models again.