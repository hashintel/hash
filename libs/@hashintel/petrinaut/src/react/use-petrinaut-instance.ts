import { use } from "react";

import { PetrinautInstanceContext } from "./instance-context";

import type { Petrinaut } from "@hashintel/petrinaut-core";

/**
 * Public-facing view of the {@link Petrinaut} instance. The mutation and
 * command surfaces are intentionally stripped so React components must reach
 * them through {@link usePetrinautMutations} / {@link usePetrinautCommands}
 * (which apply the read-only guards) rather than calling them directly on
 * the raw instance.
 */
export type PetrinautReactInstance = Omit<Petrinaut, "mutations" | "commands">;

/** The whole instance, for the hooks that guard its mutations and commands. */
export const useCoreInstance = (hookName: string): Petrinaut => {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      `${hookName} must be used inside <PetrinautProvider> (or <Petrinaut>).`,
    );
  }
  return instance;
};

export function usePetrinautInstance(): PetrinautReactInstance {
  return useCoreInstance("usePetrinautInstance");
}
