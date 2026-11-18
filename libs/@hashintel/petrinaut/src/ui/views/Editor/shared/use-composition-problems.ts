import { use } from "react";

import {
  checkComposition,
  type CompositionProblem,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../react/state/sdcpn-context";

/**
 * The problems with the net's composition: what the Diagnostics tab lists
 * and the bottom bar's indicator counts.
 */
export const useCompositionProblems = (): CompositionProblem[] => {
  const { petriNetDefinition } = use(SDCPNContext);
  return checkComposition(petriNetDefinition);
};
