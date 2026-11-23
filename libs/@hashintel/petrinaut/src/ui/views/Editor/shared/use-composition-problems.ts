import { use } from "react";

import {
  checkComposition,
  type CompositionProblem,
} from "@hashintel/petrinaut-core";

import { CompositionContext } from "../../../../react/document/composition-context";
import { SDCPNContext } from "../../../../react/document/sdcpn-context";

/**
 * The problems with the net's composition: what the Diagnostics tab lists
 * and the bottom bar's indicator counts.
 */
export const useCompositionProblems = (): CompositionProblem[] => {
  // `use` alone does not make the compiler take this for a hook. Compiled, it
  // checks when the document or its imports change, not on every render.
  "use memo";
  const { petriNetDefinition } = use(SDCPNContext);
  const { imports } = use(CompositionContext);
  return checkComposition(petriNetDefinition, imports);
};
