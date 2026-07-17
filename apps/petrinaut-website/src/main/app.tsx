import { BrunchDemoApp } from "./app/brunch-demo/brunch-demo-app";
import { isBrunchDemoRoute } from "./app/brunch-demo/brunch-route";
import { LocalStorageDemoApp } from "./app/local-storage-demo/local-storage-demo-app";

export const DemoApp = () => {
  if (isBrunchDemoRoute()) {
    return <BrunchDemoApp />;
  }

  return <LocalStorageDemoApp />;
};
