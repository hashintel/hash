/**
 * @layerRoot website.optimization
 * @role Optimization demo: wraps the editable demo with the optimizer provider
 */

import { LocalStorageDemoApp } from "../local-storage-demo/local-storage-demo-app";
import { PetrinautOptOptimizationProvider } from "./petrinaut-opt-optimization-provider";

export const OptimizationDemoApp = () => (
  <PetrinautOptOptimizationProvider>
    <LocalStorageDemoApp />
  </PetrinautOptOptimizationProvider>
);
