import { useState } from "react";

import { createCommandRegistry } from "@hashintel/petrinaut-core";

import { CommandRegistryContext } from "./command-registry";

import type { CommandRegistry } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

/**
 * Provides a registry to the tree below. Pass `registry` to share one the
 * host also gives to `createPetrinaut` or to other components; without it
 * the provider creates its own.
 */
export const CommandRegistryProvider: React.FC<{
  registry?: CommandRegistry;
  children: ReactNode;
}> = ({ registry, children }) => {
  const [ownRegistry] = useState(() => registry ?? createCommandRegistry());
  return (
    <CommandRegistryContext value={registry ?? ownRegistry}>
      {children}
    </CommandRegistryContext>
  );
};
