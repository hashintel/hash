import { createContext } from "react";

import type { SDCPNCheckResult } from "../core/checker/checker";

export type CheckResult = SDCPNCheckResult;

export interface CheckerContextValue {
  /** The result of the last SDCPN check */
  checkResult: SDCPNCheckResult;
  /** Total count of all diagnostics across all items */
  totalDiagnosticsCount: number;
}

const DEFAULT_CONTEXT_VALUE: CheckerContextValue = {
  checkResult: {
    isValid: true,
    itemDiagnostics: [],
  },
  totalDiagnosticsCount: 0,
};

export const CheckerContext = createContext<CheckerContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
