/**
 * Whether `error` is the one `raw-body` raises when the client closes the
 * connection before the request body has arrived.
 */
export const isRequestAbortedError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "request.aborted";
