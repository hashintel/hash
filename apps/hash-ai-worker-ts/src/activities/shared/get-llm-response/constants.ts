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
export const maximumRateLimitRetries = 10;

/**
 * The maximum number of times a request is retried with an exponential backoff, when encountering a server error.
 */
export const maximumExponentialBackoffRetries = 10;

/**
 * The default delay between retries when an LLM server error is encountered (e.g. because of throttling).
 */
export const serverErrorRetryStartingDelay = 5_000;
