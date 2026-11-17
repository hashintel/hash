import { createContext } from "react";

import type {
  ImportStates,
  ResolvedLibraries,
} from "@hashintel/petrinaut-core";

export type CompositionContextValue = {
  /**
   * The state of each import of the document and of each library on offer:
   * resolving, resolved or failed.
   */
  imports: ImportStates;
  /** The libraries among them that resolved, for `resolveComponent`. */
  libraries: ResolvedLibraries;
  /** The ids of the libraries the host offers to place components from. */
  offered: readonly string[];
};

/**
 * What the Core instance holds about the document's imports. Read here and
 * nowhere else: no component resolves a library itself.
 */
export const CompositionContext = createContext<CompositionContextValue>({
  imports: new Map(),
  libraries: new Map(),
  offered: [],
});
