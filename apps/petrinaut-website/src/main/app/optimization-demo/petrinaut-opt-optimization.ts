import { decodePetrinautOptimizerStream } from "@local/petrinaut-optimizer-client";

import type {
  PetrinautOptimization,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

const PETRINAUT_OPTIMIZE_ENDPOINT = "/api/petrinaut-opt/optimize/all";

type Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;
type JsonRecord = Record<string, unknown>;

/** Return whether an unknown value is a non-array JSON object. */
const isJsonRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Read the most useful error message available from an upstream response. */
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
    // Fall back to the status below when the service did not return JSON.
  }
  return `Petrinaut Opt returned status ${response.status}`;
};

/** Create the local-only Petrinaut capability backed directly by Python. */
export const createPetrinautOptOptimization = (
  fetchImpl: Fetch = fetch,
): PetrinautOptimization => ({
  /** Post one manifest and stream its canonical optimization events. */
  async *optimize(input: PetrinautOptimizationInput, options) {
    const response = await fetchImpl(PETRINAUT_OPTIMIZE_ENDPOINT, {
      method: "POST",
      headers: {
        accept: "text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify(input),
      signal: options?.signal as AbortSignal | undefined,
    });
    if (!response.ok) {
      throw new Error(await responseErrorMessage(response));
    }
    if (!response.body) {
      throw new Error("Petrinaut Opt returned an empty response");
    }

    yield* decodePetrinautOptimizerStream(response.body, {
      direction: input.objective.direction,
      requestedTrials: input.study.trials,
    });
  },
});
