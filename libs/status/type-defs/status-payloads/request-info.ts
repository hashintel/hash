/**
 * Contains metadata about the request that clients can attach when filing a bug or providing other
 * forms of feedback.
 */
export type RequestInfo = {
  /**
   * An opaque string that should only be interpreted by the service generating it. For example, it
   * can be used to identify requests in the service's logs.
   */
  request_id: string;

  /**
   * Any data that was used to serve this request. For example, an encrypted stack trace that can be
   * sent back to the service provider for debugging.
   */
  serving_data: string;
};
