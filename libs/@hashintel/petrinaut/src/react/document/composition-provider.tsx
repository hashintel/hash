import { resolvedLibraries } from "@hashintel/petrinaut-core";

import { useStore } from "../shared/use-store";
import { CompositionContext } from "./composition-context";

import type { Petrinaut } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

/**
 * Publishes the state of the document's imports and the host's rules, as the
 * Core instance holds them.
 */
export const CompositionProvider: React.FC<{
  children: ReactNode;
  instance: Petrinaut;
}> = ({ children, instance }) => {
  const imports = useStore(instance.imports);
  return (
    <CompositionContext
      value={{
        imports,
        libraries: resolvedLibraries(imports),
        offered: instance.libraries,
        rules: instance.rules,
      }}
    >
      {children}
    </CompositionContext>
  );
};
