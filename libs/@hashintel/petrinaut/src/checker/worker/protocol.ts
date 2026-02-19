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
// JSON-RPC 2.0
// ---------------------------------------------------------------------------

/** A JSON-RPC request sent from the main thread to the worker. */
export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: "checkSDCPN";
  params: { sdcpn: SDCPN };
};

/** A JSON-RPC response sent from the worker back to the main thread. */
export type JsonRpcResponse<Result = unknown> =
  | { jsonrpc: "2.0"; id: number; result: Result }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };
