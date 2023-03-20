/* Adapted from the Google Cloud Error Model
    - https://github.com/googleapis/googleapis/blob/master/google/rpc/error_details.proto
 */

/**
 * Generalized information about an error.
 *
 * Including its cause, origin, and a collection of weakly-typed additional metadata.
 */
export type ErrorInfo = {
  /**
   * The reason of the error. This is a constant value that identifies the proximate cause of
   * the error. Error reasons are unique within a particular domain of errors. This should be at
   * most 63 characters and match a regular expression of `[A-Z][A-Z0-9_]+[A-Z0-9]`, which
   * represents UPPER_SNAKE_CASE.
   */
  reason: string;

  /**
   * The logical grouping to which the "reason" belongs.
   * The error domain is typically the registered service name of the tool or product that
   * generates the error.
   */
  domain: string;

  /**
   * Additional structured details about this error.
   *
   * Keys should match /[a-zA-Z0-9-_]/ and be limited to 64 characters in length. When
   * identifying the current value of an exceeded limit, the units should be contained in the
   * key, not the value. For example, rather than {"instanceLimit": "100/request"}, should be
   * returned as, {"instanceLimitPerRequest": "100"}, if the client exceeds the number of
   * instances that can be created in a single (batch) request.
   */
  metadata: Record<string, any>;
};
