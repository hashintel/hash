import { use } from "react";

import { SDCPNContext } from "../state/sdcpn-context";
import { checkSDCPN } from "./lib/checker";
import { CheckerContext } from "./context";

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
