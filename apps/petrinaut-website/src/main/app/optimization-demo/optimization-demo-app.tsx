import { LocalStorageDemoApp } from "../local-storage-demo/local-storage-demo-app";
import { FakeOptimizationProvider } from "./fake-optimization-provider";

export const OptimizationDemoApp = () => (
  <FakeOptimizationProvider>
    <LocalStorageDemoApp />
  </FakeOptimizationProvider>
);
