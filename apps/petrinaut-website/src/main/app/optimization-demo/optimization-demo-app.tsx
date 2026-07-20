import { LocalStorageDemoApp } from "../local-storage-demo/local-storage-demo-app";
import { PetrinautOptOptimizationProvider } from "./petrinaut-opt-optimization-provider";

export const OptimizationDemoApp = () => (
  <PetrinautOptOptimizationProvider>
    <LocalStorageDemoApp />
  </PetrinautOptOptimizationProvider>
);
