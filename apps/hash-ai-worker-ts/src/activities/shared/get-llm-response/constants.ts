/**
 * The maximum number of times to retry a request to the LLM API.
 */
export const maxRetryCount = 3;

/**
 * The starting delay when a rate limit error is encountered.
 */
export const defaultRateLimitRetryDelay = 10_000;

/**
 * The maximum number of times a request is retried when a rate limit error is encountered.
 */
export const maximumRateLimitRetries = 5;