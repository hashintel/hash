import { LocalStorageDemoApp } from "../local-storage-demo/local-storage-demo-app";
import { FakeOptimizationProvider } from "./fake-optimization-provider";
import { PetrinautOptOptimizationProvider } from "./petrinaut-opt-optimization-provider";

const OptimizationProvider =
  import.meta.env.DEV &&
  import.meta.env.VITE_PETRINAUT_OPT_PROVIDER === "service"
    ? PetrinautOptOptimizationProvider
    : FakeOptimizationProvider;

export const OptimizationDemoApp = () => (
  <OptimizationProvider>
    <LocalStorageDemoApp />
  </OptimizationProvider>
);
