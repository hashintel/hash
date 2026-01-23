/**
 * LSP-like protocol types for communication between main thread and worker.
 *
 * Uses discriminated unions with `type` field for message routing.
 * Request messages include a `requestId` for correlating responses.
 */

import type ts from "typescript";

import type { SDCPN } from "../core/types/sdcpn";

// ============================================================================
// Request Types (Main Thread -> Worker)
// ============================================================================

export type InitializeRequest = {
  type: "initialize";
  sdcpn: SDCPN;
};

export type UpdateDocumentRequest = {
  type: "updateDocument";
  requestId: string;
  path: string;
  content: string;
};

export type GetCompletionsRequest = {
  type: "getCompletions";
  requestId: string;
  path: string;
  /** Character offset from start of user code (not including prefix) */
  position: number;
};

export type GetDiagnosticsRequest = {
  type: "getDiagnostics";
  requestId: string;
  /** Paths to check. If empty, checks all code files. */
  paths: string[];
};

export type LSPRequest =
  | InitializeRequest
  | UpdateDocumentRequest
  | GetCompletionsRequest
  | GetDiagnosticsRequest;

// ============================================================================
// Response Types (Worker -> Main Thread)
// ============================================================================

export type InitializedResponse = {
  type: "initialized";
};

export type DocumentUpdatedResponse = {
  type: "documentUpdated";
  requestId: string;
};

export type CompletionsResponse = {
  type: "completions";
  requestId: string;
  items: ts.CompletionInfo | undefined;
};

/**
 * Diagnostic for a single SDCPN item (transition or differential equation).
 */
export type SDCPNItemDiagnostic = {
  itemId: string;
  itemType: "transition-lambda" | "transition-kernel" | "differential-equation";
  filePath: string;
  diagnostics: SerializedDiagnostic[];
};

/**
 * Serializable representation of a TypeScript diagnostic.
 * The original ts.Diagnostic contains non-serializable properties.
 */
export type SerializedDiagnostic = {
  category: ts.DiagnosticCategory;
  code: number;
  messageText: string | DiagnosticMessageChain;
  start: number | undefined;
  length: number | undefined;
};

export type DiagnosticMessageChain = {
  messageText: string;
  category: ts.DiagnosticCategory;
  code: number;
  next?: DiagnosticMessageChain[];
};

export type DiagnosticsResponse = {
  type: "diagnostics";
  requestId: string;
  diagnostics: SDCPNItemDiagnostic[];
};

export type LSPResponse =
  | InitializedResponse
  | DocumentUpdatedResponse
  | CompletionsResponse
  | DiagnosticsResponse;

// ============================================================================
// Push Notifications (Worker -> Main Thread, unsolicited)
// ============================================================================

/**
 * Pushed when diagnostics change after a document update.
 * Allows the main thread to update UI without explicit polling.
 */
export type DiagnosticsPushNotification = {
  type: "diagnosticsPush";
  diagnostics: SDCPNItemDiagnostic[];
};

export type LSPNotification = DiagnosticsPushNotification;

/** Any message from worker to main thread */
export type LSPWorkerMessage = LSPResponse | LSPNotification;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Serializes a TypeScript diagnostic message chain for postMessage transfer.
 */
export function serializeDiagnosticMessageText(
  messageText: string | ts.DiagnosticMessageChain,
): string | DiagnosticMessageChain {
  if (typeof messageText === "string") {
    return messageText;
  }
  return {
    messageText: messageText.messageText,
    category: messageText.category,
    code: messageText.code,
    next: messageText.next?.map(serializeDiagnosticMessageText) as
      | DiagnosticMessageChain[]
      | undefined,
  };
}

/**
 * Serializes a TypeScript diagnostic for postMessage transfer.
 */
export function serializeDiagnostic(diag: ts.Diagnostic): SerializedDiagnostic {
  return {
    category: diag.category,
    code: diag.code,
    messageText: serializeDiagnosticMessageText(diag.messageText),
    start: diag.start,
    length: diag.length,
  };
}
