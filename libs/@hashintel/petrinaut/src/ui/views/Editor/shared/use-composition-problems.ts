import { use } from "react";

import {
  checkComposition,
  type CompositionProblem,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../react/state/composition-context";
import { SDCPNContext } from "../../../../react/state/sdcpn-context";

/**
 * The problems with the net's composition: what the Diagnostics tab lists
 * and the bottom bar's indicator counts. An instance of a component the host
 * provides needs no implementation, so it is not among them.
 */
export const useCompositionProblems = (): CompositionProblem[] => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { provided } = use(CompositionContext);
  return checkComposition(petriNetDefinition, provided);
};
