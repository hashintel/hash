import { use } from "react";

import {
  isConnectedOptimization,
  type PetrinautOptimizationSource,
} from "@hashintel/petrinaut-core/optimization";

import { PetrinautOptimizationContext } from "../optimization-context";
import { UserSettingsContext } from "../state/user-settings-context";

/**
 * The host's optimization source as the UI may use it. A remote capability
 * passes through unchanged; a connected one counts only while the experimental
 * In-browser optimization setting is on. `null` keeps the Optimizations
 * surfaces hidden and nothing connects.
 */
export const useOptimizationSource = (): PetrinautOptimizationSource | null => {
  const source = use(PetrinautOptimizationContext);
  const { enableInBrowserOptimization } = use(UserSettingsContext);
  if (source === null) {
    return null;
  }
  if (isConnectedOptimization(source) && !enableInBrowserOptimization) {
    return null;
  }
  return source;
};
