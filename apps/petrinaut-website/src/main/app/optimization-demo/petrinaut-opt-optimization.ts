import { openPetrinautOptimizationStream } from "@local/petrinaut-optimizer-client";

import type {
  PetrinautOptimization,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";

const PETRINAUT_OPTIMIZE_ENDPOINT = "/api/petrinaut-opt/optimize/all";

/** Create the local-only Petrinaut capability backed directly by Python. */
export const createPetrinautOptOptimization = (
  fetchImpl: PetrinautOptimizerFetch = fetch,
): PetrinautOptimization => ({
  /** Post one manifest and stream its canonical optimization events. */
  async *optimize(input: PetrinautOptimizationInput, options) {
    const { events } = await openPetrinautOptimizationStream({
      endpoint: PETRINAUT_OPTIMIZE_ENDPOINT,
      fetchImpl,
      input,
      ...(options?.signal ? { signal: options.signal } : {}),
    });
    yield* events;
  },
});
