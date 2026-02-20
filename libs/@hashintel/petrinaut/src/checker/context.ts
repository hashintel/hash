import { createContext } from "react";

import type {
  CheckerCompletionResult,
  CheckerItemDiagnostics,
  CheckerQuickInfoResult,
  CheckerResult,
  CheckerSignatureHelpResult,
} from "./worker/protocol";

export interface CheckerContextValue {
  /** Result of the last SDCPN validation run. */
  checkResult: CheckerResult;
  /** Total number of diagnostics across all items. */
  totalDiagnosticsCount: number;
  /** Request completions at a position within an SDCPN item. */
  getCompletions: (
    itemType: CheckerItemDiagnostics["itemType"],
    itemId: string,
    offset: number,
  ) => Promise<CheckerCompletionResult>;
  /** Request quick info (hover) at a position within an SDCPN item. */
  getQuickInfo: (
    itemType: CheckerItemDiagnostics["itemType"],
    itemId: string,
    offset: number,
  ) => Promise<CheckerQuickInfoResult>;
  /** Request signature help at a position within an SDCPN item. */
  getSignatureHelp: (
    itemType: CheckerItemDiagnostics["itemType"],
    itemId: string,
    offset: number,
  ) => Promise<CheckerSignatureHelpResult>;
}

const DEFAULT_CONTEXT_VALUE: CheckerContextValue = {
  checkResult: {
    isValid: true,
    itemDiagnostics: [],
  },
  totalDiagnosticsCount: 0,
  getCompletions: () => Promise.resolve({ items: [] }),
  getQuickInfo: () => Promise.resolve(null),
  getSignatureHelp: () => Promise.resolve(null),
};

export const CheckerContext = createContext<CheckerContextValue>(
  DEFAULT_CONTEXT_VALUE,
);
