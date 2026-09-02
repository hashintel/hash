/**
 * @layerRoot website.optimization
 * @role Optimization demo: wraps the editable demo with the optimizer provider
 */

import { LocalStorageDemoApp } from "../local-storage-demo/local-storage-demo-app";
import { PetrinautOptOptimizationProvider } from "./petrinaut-opt-optimization-provider";

import type { ComponentProps } from "react";

export const OptimizationDemoApp = (
  props: ComponentProps<typeof LocalStorageDemoApp>,
) => (
  <PetrinautOptOptimizationProvider>
    <LocalStorageDemoApp {...props} />
  </PetrinautOptOptimizationProvider>
);
