import { PetrinautOptimizationContext } from "@hashintel/petrinaut";

import { createBridgePetrinautOptimization } from "./create-bridge-petrinaut-optimization";

import type { PropsWithChildren } from "react";

const hashPetrinautOptimization = createBridgePetrinautOptimization();

/** Supplies the HASH host/NodeAPI optimization bridge to embedded Petrinaut. */
export const HASHPetrinautOptimizationProvider = ({
  children,
  enabled,
}: PropsWithChildren<{ enabled: boolean }>) =>
  enabled ? (
    <PetrinautOptimizationContext value={hashPetrinautOptimization}>
      {children}
    </PetrinautOptimizationContext>
  ) : (
    children
  );
