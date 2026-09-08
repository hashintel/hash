import { createBrowserOptimization } from "@hashintel/petrinaut-core/browser-optimization";
import { PetrinautOptimizationContext } from "@hashintel/petrinaut/react";

import type { FC, PropsWithChildren } from "react";

const browserOptimization = createBrowserOptimization();

/**
 * The in-tab optimizer: the Optuna study runs in a Pyodide worker and each
 * step runs on the editor's own experiments backend, so the demo needs no
 * optimizer service. Petrinaut connects it only while its experimental
 * In-browser optimization setting is on.
 */
export const BrowserOptimizationProvider: FC<PropsWithChildren> = ({
  children,
}) => (
  <PetrinautOptimizationContext value={browserOptimization}>
    {children}
  </PetrinautOptimizationContext>
);
