import { PetrinautOptimizationContext } from "@hashintel/petrinaut/react";

import { createPetrinautOptOptimization } from "./petrinaut-opt-optimization";

import type { FC, PropsWithChildren } from "react";

const petrinautOptOptimization = createPetrinautOptOptimization();

/** Direct Petrinaut Opt integration for the local demo website only. */
export const PetrinautOptOptimizationProvider: FC<PropsWithChildren> = ({
  children,
}) => (
  <PetrinautOptimizationContext value={petrinautOptOptimization}>
    {children}
  </PetrinautOptimizationContext>
);
