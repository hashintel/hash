import { createContext } from "react";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";
import type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimizationChannel,
  PetrinautOptimizationSource,
} from "@hashintel/petrinaut-core/optimization";

/**
 * Optional host-provided optimization source: a remote capability, or a
 * connected optimizer that runs its trials through the host's own compute.
 *
 * A `null` value means that optimization is unavailable and its UI is hidden.
 */
export const PetrinautOptimizationContext =
  createContext<PetrinautOptimizationSource | null>(null);

export type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimization,
  PetrinautOptimizationChannel,
  PetrinautOptimizationSource,
};
