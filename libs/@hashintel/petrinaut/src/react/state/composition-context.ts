import { createContext } from "react";

import {
  noProvidedInterfaces,
  type ProvidedInterfaces,
} from "@hashintel/petrinaut-core";

export type CompositionContextValue = {
  /** The interfaces of the components the host provides for the user to instantiate. */
  provided: ProvidedInterfaces;
  /**
   * Whether the editor only composes those components: it places and wires
   * instances of them, and offers nothing that draws or runs a net.
   */
  compositionOnly: boolean;
};

/** What the host says about composing: read off the Core instance. */
export const CompositionContext = createContext<CompositionContextValue>({
  provided: noProvidedInterfaces,
  compositionOnly: false,
});
