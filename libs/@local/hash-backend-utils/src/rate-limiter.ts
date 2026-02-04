import { backOff } from "exponential-backoff";

/**
 * Options for configuring a rate-limited requester.
 */
export type RateLimiterOptions = {
  /** Minimum interval between requests in milliseconds */
  requestIntervalMs: number;
  /** Maximum number of retry attempts for rate limit errors */
  maxRetries: number;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Creates a rate-limited request function that ensures proper request spacing
 * and handles rate limit (429) errors with exponential backoff.
 *
 * Uses promise chaining to prevent race conditions between concurrent requests,
 * ensuring requests are spaced at least `requestIntervalMs` apart.
 *
 * @param requestFn - The underlying request function to wrap (must be generic)
 * @param options - Rate limiter configuration
 * @returns A rate-limited version of the request function that preserves type parameters
 *
 * @example
 * ```typescript
 * const rateLimitedFetch = createRateLimitedRequester(
 *   async <T>(url: string): Promise<T> => {
 *     const response = await fetch(url);
 *     if (!response.ok) {
 *       const error = new Error(`HTTP ${response.status}`);
 *       (error as Error & { status: number }).status = response.status;
 *       throw error;
 *     }
 *     return response.json() as T;
 *   },
 *   { requestIntervalMs: 1000, maxRetries: 10 }
 * );
 * ```
 */
export const createRateLimitedRequester = (
  requestFn: <T>(url: string) => Promise<T>,
  options: RateLimiterOptions,
): (<T>(url: string) => Promise<T>) => {
  let requestQueue: Promise<void> = Promise.resolve();

  return async <T>(url: string): Promise<T> => {
    // Chain this request after the previous one to ensure proper spacing
    const executeRequest = async (): Promise<T> => {
      return backOff(() => requestFn<T>(url), {
        numOfAttempts: options.maxRetries,
        startingDelay: 1000,
        maxDelay: 30_000,
        jitter: "full",
        retry: (error: unknown) => {
          // Retry on 429 rate limit errors
          if (error && typeof error === "object" && "status" in error) {
            return (error as { status: number }).status === 429;
          }
          // Also retry if the error message mentions rate limiting
          if (error instanceof Error && error.message.includes("429")) {
            return true;
          }
          return false;
        },
      });
    };

    // Queue this request with proper spacing between requests
    const result = new Promise<T>((resolve, reject) => {
      requestQueue = requestQueue
        .then(async () => {
          const response = await executeRequest();
          resolve(response);
          // Wait after successful request to ensure spacing
          await sleep(options.requestIntervalMs);
        })
        .catch(async (error: Error) => {
          reject(error);
          // Wait even after failed request to maintain spacing
          await sleep(options.requestIntervalMs);
        });
    });

    return result;
  };
};
