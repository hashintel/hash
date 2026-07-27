import { BrunchDemoApp } from "./app/brunch-demo/brunch-demo-app";
import { isBrunchDemoRoute } from "./app/brunch-demo/brunch-route";
import { LocalStorageDemoApp } from "./app/local-storage-demo/local-storage-demo-app";
import { OptimizationDemoApp } from "./app/optimization-demo/optimization-demo-app";
import { isOptimizationDemoRoute } from "./app/optimization-demo/optimization-route";

export const DemoApp = () => {
  if (isBrunchDemoRoute()) {
    return <BrunchDemoApp />;
  }

  if (
    isOptimizationDemoRoute() &&
    import.meta.env.VITE_PETRINAUT_OPT_PROVIDER === "service"
  ) {
    return <OptimizationDemoApp />;
  }

  return <LocalStorageDemoApp />;
};
