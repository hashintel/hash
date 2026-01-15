import { useEffect, useState } from "react";

import { checkSDCPN, type SDCPNCheckResult } from "../core/checker/checker";
import { CheckerContext } from "./checker-context";
import { useSDCPNContext } from "./sdcpn-context";

export {
  CheckerContextValue,
  CheckResult,
  useCheckerContext,
} from "./checker-context";

export const CheckerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { petriNetDefinition } = useSDCPNContext();

  const [checkResult, setCheckResult] = useState<SDCPNCheckResult>(() =>
    checkSDCPN(petriNetDefinition),
  );

  // Re-run checker whenever the SDCPN changes
  useEffect(() => {
    const result = checkSDCPN(petriNetDefinition);
    setCheckResult(result);
  }, [petriNetDefinition]);

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
