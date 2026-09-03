import { createServicePetrinautOptimization } from "@local/petrinaut-optimizer-client";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";

/**
 * Dev-proxy base for the local Petrinaut Optimizer: `vite.config.ts` rewrites
 * `/api/petrinaut-opt/*` to the Python service. Resolved against the current
 * document at call time; the client's URL builder keeps the path prefix.
 */
const petrinautOptEndpoint = (): URL =>
  new URL(
    "/api/petrinaut-opt/",
    // Tests run without a DOM; the browser always resolves from the page.
    typeof location === "undefined" ? "http://localhost/" : location.href,
  );

/** Create the local-only Petrinaut capability backed directly by Python. */
export const createPetrinautOptOptimization = (
  fetchImpl: PetrinautOptimizerFetch = fetch,
): PetrinautOptimization =>
  createServicePetrinautOptimization({
    endpoint: petrinautOptEndpoint,
    fetchImpl,
  });
