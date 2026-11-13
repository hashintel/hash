import { use } from "react";

import { checkFusions, type FusionProblem } from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../../../../react/state/sdcpn-context";

/**
 * The problems with the net's composition: what the Diagnostics tab lists
 * and the bottom bar's indicator counts.
 */
export const useCompositionProblems = (): FusionProblem[] => {
  const { petriNetDefinition } = use(SDCPNContext);
  return checkFusions(petriNetDefinition);
};
