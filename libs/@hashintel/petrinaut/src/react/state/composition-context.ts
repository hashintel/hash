import { createContext } from "react";

import type {
  ImportStates,
  PetrinautRules,
  ResolvedLibraries,
} from "@hashintel/petrinaut-core";

type CompositionContextValue = {
  /**
   * The state of each import of the document and of each library on offer:
   * resolving, resolved or failed.
   */
  imports: ImportStates;
  /** The libraries among them that resolved, for `resolveComponent`. */
  libraries: ResolvedLibraries;
  /** The ids of the libraries the host offers to place components from. */
  offered: readonly string[];
  /**
   * The rules the host set on the instance. Ask `useComposesOnly` what they
   * mean for the editor: no component reads into them.
   */
  rules: PetrinautRules;
};

/**
 * What the Core instance holds about the document's imports and the host's
 * rules. Read here and nowhere else: no component resolves a library itself.
 */
export const CompositionContext = createContext<CompositionContextValue>({
  imports: new Map(),
  libraries: new Map(),
  offered: [],
  rules: {},
});
