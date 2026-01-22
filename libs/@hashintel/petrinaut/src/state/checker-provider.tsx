import { use } from "react";

import { checkSDCPN } from "../core/checker/checker";
import { CheckerContext } from "./checker-context";
import { SDCPNContext } from "./sdcpn-context";

export const CheckerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);

  const checkResult = checkSDCPN(petriNetDefinition);

  const totalDiagnosticsCount = checkResult.itemDiagnostics.reduce(
    (sum, item) => sum + item.diagnostics.length,
    0,
  );

  return (
    <CheckerContext.Provider
      value={{
        checkResult,
        totalDiagnosticsCount,
      }}
    >
      {children}
    </CheckerContext.Provider>
  );
};
