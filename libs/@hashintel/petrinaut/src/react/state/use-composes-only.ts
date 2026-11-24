import { use } from "react";

import { composesOnly } from "@hashintel/petrinaut-core";

import { CompositionContext } from "./composition-context";

/**
 * Whether the host's rules keep the editor to composing: it places and wires
 * instances of the components of the libraries on offer, in the root net,
 * and offers nothing that draws or runs a net.
 */
export const useComposesOnly = (): boolean =>
  composesOnly(use(CompositionContext).rules);
