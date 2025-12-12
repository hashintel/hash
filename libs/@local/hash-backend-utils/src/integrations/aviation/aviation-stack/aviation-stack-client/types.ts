export type PaginationResponse = {
  /** The maximum number of results to return in a single response */
  limit: number;
  /** The offset from the beginning of the result set */
  offset: number;
  /** The number of results returned in this response */
  count: number;
  /** The total number of results available */
  total: number;
};

export type ErrorResponse = {
  error: {
    /** A unique error code identifying the type of error */
    code: string;
    /** A human-readable description of the error */
    message: string;
    /** Additional context about the error, if available */
    context?: Record<string, unknown>;
  };
};
