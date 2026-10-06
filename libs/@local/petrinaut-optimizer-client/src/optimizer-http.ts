type JsonRecord = Record<string, unknown>;

/** Fetch-compatible function used to call Petrinaut Optimizer. */
export type PetrinautOptimizerFetch = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

/** Error returned when Petrinaut Optimizer rejects an HTTP request. */
export class PetrinautOptimizerHttpError extends Error {
  /** Create an optimizer HTTP error while retaining transport metadata. */
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null,
    readonly optimizationRunId: string | null = null,
  ) {
    super(message);
    this.name = "PetrinautOptimizerHttpError";
  }
}

/**
 * Resolve a service-relative path against the optimizer endpoint, keeping any
 * path prefix the endpoint carries (e.g. a dev proxy mounting the service
 * under `/api/petrinaut-opt`).
 */
export const petrinautOptimizerUrl = (
  endpoint: string | URL,
  path: string,
): URL => {
  const base = new URL(endpoint);
  if (!base.pathname.endsWith("/")) {
    base.pathname = `${base.pathname}/`;
  }
  return new URL(path, base);
};

/** Return whether an unknown value is a non-array JSON object. */
const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A settled optimizer call, as resolved by the generated client. */
export type PetrinautOptimizerResult = {
  data: unknown;
  status: number;
  headers: Headers;
};

/** Read the most useful safe message from a failed optimizer response body. */
const resultErrorMessage = ({ data, status }: PetrinautOptimizerResult) => {
  if (isJsonRecord(data)) {
    if (typeof data.detail === "string") {
      return data.detail;
    }

    if (typeof data.message === "string") {
      return data.message;
    }
  }

  return `Petrinaut optimizer returned status ${status}`;
};

/** Build the canonical error for a non-ok result of the generated client. */
export const petrinautOptimizerHttpErrorFromResult = (
  result: PetrinautOptimizerResult,
): PetrinautOptimizerHttpError =>
  new PetrinautOptimizerHttpError(
    resultErrorMessage(result),
    result.status,
    result.headers.get("retry-after"),
    result.headers.get("x-optimization-run-id"),
  );

/** Build the canonical error for a non-ok optimizer response. */
export const petrinautOptimizerHttpErrorFromResponse = async (
  response: Response,
): Promise<PetrinautOptimizerHttpError> => {
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    // Fall back to the status when the service did not return JSON.
  }

  return petrinautOptimizerHttpErrorFromResult({
    data,
    status: response.status,
    headers: response.headers,
  });
};
