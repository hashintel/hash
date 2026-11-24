import { use } from "react";

import { ActiveNetContext } from "../document/active-net-context";
import { usePetrinautInstance } from "../document/use-petrinaut-instance";

import type { PetrinautMutations } from "@hashintel/petrinaut-core";

/**
 * A function that says why the host's rules would refuse a mutation aimed at
 * the active net, or `null`: what `usePetrinautMutations` asks before it
 * runs one, for a caller that must know the answer too.
 */
export const useMutationRefusal = () => {
  const { mutationRefusal } = usePetrinautInstance();
  const { activeComponentId } = use(ActiveNetContext);

  return (name: keyof PetrinautMutations, input: object): string | null =>
    mutationRefusal(name, { ...input, targetComponentId: activeComponentId });
};
