import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { checkSDCPN, type SDCPNCheckResult } from "../core/checker/checker";
import { useSDCPNContext } from "./sdcpn-provider";

export type CheckResult = SDCPNCheckResult;

interface CheckerContextValue {
  /** The result of the last SDCPN check */
  checkResult: SDCPNCheckResult;
  /** Total count of all diagnostics across all items */
  totalDiagnosticsCount: number;
}

const CheckerContext = createContext<CheckerContextValue | null>(null);

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

  const totalDiagnosticsCount = useMemo(
    () =>
      checkResult.itemDiagnostics.reduce(
        (sum, item) => sum + item.diagnostics.length,
        0,
      ),
    [checkResult],
  );

  const value = useMemo<CheckerContextValue>(
    () => ({
      checkResult,
      totalDiagnosticsCount,
    }),
    [checkResult, totalDiagnosticsCount],
  );

  return (
    <CheckerContext.Provider value={value}>{children}</CheckerContext.Provider>
  );
};

export function useCheckerContext(): CheckerContextValue {
  const context = useContext(CheckerContext);

  if (!context) {
    throw new Error("useCheckerContext must be used within CheckerProvider");
  }

  return context;
}
