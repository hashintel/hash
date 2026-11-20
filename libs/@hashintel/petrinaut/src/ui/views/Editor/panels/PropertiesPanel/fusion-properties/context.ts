import { createContext, use } from "react";

import type { Fusion } from "@hashintel/petrinaut-core";

export const FusionContext = createContext<Fusion | null>(null);

export const useFusion = (): Fusion => {
  const fusion = use(FusionContext);
  if (!fusion) {
    throw new Error("useFusion must be used within FusionProperties");
  }
  return fusion;
};
