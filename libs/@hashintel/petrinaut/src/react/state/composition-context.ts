import { createContext } from "react";

import {
  noProvidedInterfaces,
  type ProvidedInterfaces,
} from "@hashintel/petrinaut-core";

export type CompositionContextValue = {
  /** The interfaces of the components the host provides for the user to instantiate. */
  provided: ProvidedInterfaces;
};

/** What the host says about composing: read off the Core instance. */
export const CompositionContext = createContext<CompositionContextValue>({
  provided: noProvidedInterfaces,
});
