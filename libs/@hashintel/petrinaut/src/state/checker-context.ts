import { createContext } from "react";

import type {
  DiagnosticMessageChain,
  SDCPNItemDiagnostic,
} from "../lsp/protocol";

/**
 * Diagnostic type that works with both LSP and direct TypeScript diagnostics.
 * This is a subset of ts.Diagnostic that our UI code actually uses.
 */
export type CheckerDiagnostic = {
  category: number;
  code: number;
  messageText: string | DiagnosticMessageChain;
  start: number | undefined;
  length: number | undefined;
};

/**
 * Item diagnostic using the checker-compatible diagnostic type.
 */
export type CheckerItemDiagnostic = {
  itemId: string;
  itemType: "transition-lambda" | "transition-kernel" | "differential-equation";
  filePath: string;
  diagnostics: CheckerDiagnostic[];
};

/**
 * Result of SDCPN validation.
 */
export type CheckerResult = {
  isValid: boolean;
  itemDiagnostics: CheckerItemDiagnostic[];
};

export interface CheckerContextValue {
  /** The result of the last SDCPN check */
  checkResult: CheckerResult;
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

/**
 * Converts LSP diagnostics to checker format.
 * The types are structurally identical, this just helps TypeScript.
 */
export function lspToCheckerDiagnostics(
  lspDiagnostics: SDCPNItemDiagnostic[],
): CheckerItemDiagnostic[] {
  return lspDiagnostics.map((item) => ({
    itemId: item.itemId,
    itemType: item.itemType,
    filePath: item.filePath,
    diagnostics: item.diagnostics,
  }));
}
