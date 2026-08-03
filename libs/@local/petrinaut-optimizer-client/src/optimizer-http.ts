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

/** Read the most useful safe message from a failed optimizer response. */
const responseErrorMessage = async (response: Response): Promise<string> => {
  try {
    const payload: unknown = await response.json();
    if (isJsonRecord(payload)) {
      if (typeof payload.detail === "string") {
        return payload.detail;
      }
      if (typeof payload.message === "string") {
        return payload.message;
      }
    }
  } catch {
    // Fall back to the status when the service did not return JSON.
  }
  return `Petrinaut optimizer returned status ${response.status}`;
};

/** Build the canonical error for a non-ok optimizer response. */
export const petrinautOptimizerHttpErrorFromResponse = async (
  response: Response,
): Promise<PetrinautOptimizerHttpError> =>
  new PetrinautOptimizerHttpError(
    await responseErrorMessage(response),
    response.status,
    response.headers.get("retry-after"),
    response.headers.get("x-optimization-run-id"),
  );
