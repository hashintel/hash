import { use, useMemo } from "react";

import {
  type DefaultParameterValues,
  deriveDefaultParameterValues,
  mergeParameterValues,
} from "../core/parameter-values";
import { SDCPNContext } from "../state/sdcpn-context";

// Re-export the pure utilities for back-compat with existing import sites.
// The canonical home is `@hashintel/petrinaut/core/parameter-values`.
export {
  type DefaultParameterValues,
  deriveDefaultParameterValues,
  mergeParameterValues,
};

/**
 * Derives default parameter values from SDCPN Store Parameters.
 * This ensures that parameter values are always consistent with the SDCPN definition.
 *
 * The hook converts parameter default values from their string representation
 * to the appropriate type (number or boolean) based on the parameter type.
 *
 * @returns A record mapping parameter IDs to their default values as numbers or booleans
 */
export function useDefaultParameterValues(): DefaultParameterValues {
  const {
    petriNetDefinition: { parameters },
  } = use(SDCPNContext);

  return useMemo(() => {
    return deriveDefaultParameterValues(parameters);
  }, [parameters]);
}
