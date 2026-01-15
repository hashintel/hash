import { createContext, use } from "react";

import type { SDCPNCheckResult } from "../core/checker/checker";

export type CheckResult = SDCPNCheckResult;

export interface CheckerContextValue {
  /** The result of the last SDCPN check */
  checkResult: SDCPNCheckResult;
  /** Total count of all diagnostics across all items */
  totalDiagnosticsCount: number;
}

export const CheckerContext = createContext<CheckerContextValue | null>(null);

export function useCheckerContext(): CheckerContextValue {
  const context = use(CheckerContext);

  if (!context) {
    throw new Error("useCheckerContext must be used within CheckerProvider");
  }

  return context;
}
