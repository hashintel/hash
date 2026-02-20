/**
 * JSON-RPC 2.0 protocol types for the checker WebWorker.
 *
 * These types define the contract between the main thread and the worker.
 * Diagnostic types are serializable (no `ts.SourceFile` references) so they
 * can cross the postMessage boundary via structured clone.
 */
import type { SDCPN } from "../../core/types/sdcpn";

// ---------------------------------------------------------------------------
// Diagnostics — serializable variants of ts.Diagnostic
// ---------------------------------------------------------------------------

/** A single TypeScript diagnostic, safe for structured clone. */
export type CheckerDiagnostic = {
  /** @see ts.DiagnosticCategory */
  category: number;
  /** TypeScript error code (e.g. 2322 for type mismatch). */
  code: number;
  /** Human-readable message, pre-flattened from `ts.DiagnosticMessageChain`. */
  messageText: string;
  /** Character offset in user code where the error starts. */
  start: number | undefined;
  /** Length of the error span in characters. */
  length: number | undefined;
};

/** Diagnostics grouped by SDCPN item (one transition function or differential equation). */
export type CheckerItemDiagnostics = {
  /** ID of the transition or differential equation. */
  itemId: string;
  /** Which piece of code was checked. */
  itemType: "transition-lambda" | "transition-kernel" | "differential-equation";
  /** Path in the virtual file system used by the TS LanguageService. */
  filePath: string;
  /** All diagnostics found in this item's code. */
  diagnostics: CheckerDiagnostic[];
};

/** Result of validating an entire SDCPN model. */
export type CheckerResult = {
  /** `true` when every item compiles without errors. */
  isValid: boolean;
  /** Per-item diagnostics (empty when valid). */
  itemDiagnostics: CheckerItemDiagnostics[];
};

// ---------------------------------------------------------------------------
// Completions — serializable variants of ts.CompletionEntry
// ---------------------------------------------------------------------------

/** A single completion suggestion, safe for structured clone. */
export type CheckerCompletionItem = {
  name: string;
  /** @see ts.ScriptElementKind */
  kind: string;
  sortText: string;
  insertText?: string;
};

/** Result of requesting completions at a position. */
export type CheckerCompletionResult = {
  items: CheckerCompletionItem[];
};

// ---------------------------------------------------------------------------
// Quick Info (hover) — serializable variant of ts.QuickInfo
// ---------------------------------------------------------------------------

/** Result of requesting quick info (hover) at a position. */
export type CheckerQuickInfoResult = {
  /** Type/signature display string. */
  displayParts: string;
  /** JSDoc documentation string. */
  documentation: string;
  /** Offset in user code where the hovered symbol starts. */
  start: number;
  /** Length of the hovered symbol span. */
  length: number;
} | null;

// ---------------------------------------------------------------------------
// Signature Help — serializable variant of ts.SignatureHelpItems
// ---------------------------------------------------------------------------

/** A single parameter in a signature. */
export type CheckerSignatureParameter = {
  label: string;
  documentation: string;
};

/** A single signature (overload). */
export type CheckerSignatureInfo = {
  label: string;
  documentation: string;
  parameters: CheckerSignatureParameter[];
};

/** Result of requesting signature help at a position. */
export type CheckerSignatureHelpResult = {
  signatures: CheckerSignatureInfo[];
  activeSignature: number;
  activeParameter: number;
} | null;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0
// ---------------------------------------------------------------------------

/** A JSON-RPC request sent from the main thread to the worker. */
export type JsonRpcRequest =
  | {
      jsonrpc: "2.0";
      id: number;
      method: "setSDCPN";
      params: { sdcpn: SDCPN };
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "getCompletions";
      params: {
        itemType: CheckerItemDiagnostics["itemType"];
        itemId: string;
        offset: number;
      };
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "getQuickInfo";
      params: {
        itemType: CheckerItemDiagnostics["itemType"];
        itemId: string;
        offset: number;
      };
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "getSignatureHelp";
      params: {
        itemType: CheckerItemDiagnostics["itemType"];
        itemId: string;
        offset: number;
      };
    };

/** A JSON-RPC response sent from the worker back to the main thread. */
export type JsonRpcResponse<Result = unknown> =
  | { jsonrpc: "2.0"; id: number; result: Result }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };
