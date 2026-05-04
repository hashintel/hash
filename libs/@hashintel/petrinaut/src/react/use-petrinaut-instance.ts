import { use } from "react";

import type { Petrinaut } from "../core/instance";
import { PetrinautInstanceContext } from "./instance-context";

export function usePetrinautInstance(): Petrinaut {
  const instance = use(PetrinautInstanceContext);
  if (!instance) {
    throw new Error(
      "usePetrinautInstance must be used inside <PetrinautProvider> (or <PetrinautNext>).",
    );
  }
  return instance;
}
