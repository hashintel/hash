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

export function usePetrinautInstance(): PetrinautReactInstance {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      "usePetrinautInstance must be used inside <PetrinautProvider> (or <Petrinaut>).",
    );
  }
  return instance;
}
