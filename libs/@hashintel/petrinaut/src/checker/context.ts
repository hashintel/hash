import { createContext } from "react";

import type { CheckerResult } from "./worker/protocol";

export interface CheckerContextValue {
  /** Result of the last SDCPN validation run. */
  checkResult: CheckerResult;
  /** Total number of diagnostics across all items. */
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
