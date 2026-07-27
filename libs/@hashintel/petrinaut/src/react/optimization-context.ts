import { createContext } from "react";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";

/**
 * Optional host-provided optimization capability.
 *
 * A `null` value means that optimization is unavailable and its UI is hidden.
 */
export const PetrinautOptimizationContext =
  createContext<PetrinautOptimization | null>(null);

export type { PetrinautOptimization };
