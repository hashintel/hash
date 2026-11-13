import { createContext } from "react";

import type {
  ImportStates,
  ResolvedLibraries,
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

/**
 * What the Core instance holds about the document's imports. Read here and
 * nowhere else: no component resolves a library itself.
 */
export const CompositionContext = createContext<CompositionContextValue>({
  provided: noProvidedInterfaces,
  compositionOnly: false,
});
