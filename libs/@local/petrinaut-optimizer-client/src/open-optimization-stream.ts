import { decodePetrinautOptimizerStream } from "./decode-optimization-stream.js";

import type {
  AbortSignalLike,
  PetrinautOptimizationEvent,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

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

/** Configuration for opening one Petrinaut Optimizer study stream. */
export type OpenPetrinautOptimizationStreamOptions = {
  /** URL of Petrinaut Optimizer's `/optimize/all` endpoint. */
  endpoint: string | URL;
  /** Fetch implementation supplied by the current runtime or a test. */
  fetchImpl?: PetrinautOptimizerFetch;
  /** Complete optimization manifest sent to Petrinaut Optimizer. */
  input: PetrinautOptimizationInput;
  /** Optional maximum UTF-8 size of one upstream SSE event. */
  maxEventBytes?: number;
  /** Called whenever upstream bytes arrive, including heartbeats. */
  onActivity?: () => void;
  /** Correlation id forwarded upstream as the `x-hash-request-id` header. */
  requestId?: string;
  /** Signal used to cancel the request and its response stream. */
  signal?: AbortSignalLike;
};

/** One opened optimization stream plus its upstream correlation id. */
export type PetrinautOptimizationStreamHandle = {
  /** Canonical optimization events decoded from the upstream stream. */
  events: AsyncIterable<PetrinautOptimizationEvent>;
  /** The optimizer's `X-Optimization-Run-ID` header, when provided. */
  optimizationRunId: string | null;
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

/**
 * Post an optimization manifest and open its canonical event stream.
 *
 * This isomorphic transport boundary is shared by NodeAPI and direct browser
 * development integrations so they use identical request and error handling.
 */
export const openPetrinautOptimizationStream = async ({
  endpoint,
  fetchImpl = fetch,
  input,
  maxEventBytes,
  onActivity,
  requestId,
  signal,
}: OpenPetrinautOptimizationStreamOptions): Promise<PetrinautOptimizationStreamHandle> => {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
      ...(requestId === undefined ? {} : { "x-hash-request-id": requestId }),
    },
    body: JSON.stringify(input),
    signal: signal as AbortSignal | undefined,
  });
  if (!response.ok) {
    throw new PetrinautOptimizerHttpError(
      await responseErrorMessage(response),
      response.status,
      response.headers.get("retry-after"),
      response.headers.get("x-optimization-run-id"),
    );
  }
  if (!response.body) {
    throw new Error("Petrinaut optimizer returned an empty response");
  }

  return {
    events: decodePetrinautOptimizerStream(response.body, {
      direction: input.objective.direction,
      requestedTrials: input.study.trials,
      ...(maxEventBytes === undefined ? {} : { maxEventBytes }),
      ...(onActivity ? { onActivity } : {}),
    }),
    optimizationRunId: response.headers.get("x-optimization-run-id"),
  };
};
