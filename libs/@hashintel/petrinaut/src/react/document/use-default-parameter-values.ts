import { use } from "react";

import {
  type DefaultParameterValues,
  deriveDefaultParameterValues,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "./sdcpn-context";

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
  "use memo";
  const {
    extensions,
    petriNetDefinition: { parameters },
  } = use(SDCPNContext);

  return extensions.parameters ? deriveDefaultParameterValues(parameters) : {};
}
