import { createContext } from "react";

import type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimizationChannel,
} from "@hashintel/petrinaut-core/optimization";

/**
 * Optional host-provided optimizer: a connected optimizer that runs its
 * trials through the host's own compute.
 *
 * A `null` value means that optimization is unavailable and its UI is hidden.
 */
export const PetrinautOptimizationContext =
  createContext<PetrinautConnectedOptimization | null>(null);

export type {
  PetrinautConnectedOptimization,
  PetrinautConnectedOptimizationCapability,
  PetrinautConnectedRunOptions,
  PetrinautOptimizationChannel,
};
