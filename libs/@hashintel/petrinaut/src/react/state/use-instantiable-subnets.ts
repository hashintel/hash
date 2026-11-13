import { use } from "react";

import { instantiableSubnets, type Subnet } from "@hashintel/petrinaut-core";

import { CompositionContext } from "./composition-context";
import { SDCPNContext } from "./sdcpn-context";

/**
 * The subnets a new component instance can point at: the document's own, and
 * the components the host provides. An editor that only composes offers the
 * host's alone.
 */
export const useInstantiableSubnets = (): Subnet[] => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { provided, compositionOnly } = use(CompositionContext);
  return compositionOnly
    ? [...provided.values()]
    : instantiableSubnets(petriNetDefinition, provided);
};
