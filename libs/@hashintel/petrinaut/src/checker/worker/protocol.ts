/**
 * LSP-inspired protocol types for the checker WebWorker.
 *
 * Uses JSON-RPC 2.0 with LSP-like method names and structures.
 * Diagnostic types are serializable (no `ts.SourceFile` references) so they
 * can cross the postMessage boundary via structured clone.
 *
 * Deviations from LSP:
 * - Uses character offsets instead of line/character positions (both Monaco
 *   and the TS LanguageService work in offsets internally).
 * - Uses `sdcpn/didChange` for structural model changes (not per-document).
 */
import type { SDCPN } from "../../core/types/sdcpn";

// ---------------------------------------------------------------------------
// Document identification
// ---------------------------------------------------------------------------

/** URI identifying a text document (e.g., "inmemory://sdcpn/transitions/t1/lambda.ts"). */
export type DocumentUri = string;

export type TextDocumentIdentifier = {
  uri: DocumentUri;
};

/**
 * Position in a text document, specified as a character offset.
 *
 * Unlike standard LSP (which uses line/character), we use offsets since both
 * Monaco and the TS LanguageService work in offsets internally.
 */
export type TextDocumentPositionParams = {
  textDocument: TextDocumentIdentifier;
  offset: number;
};

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/** A single diagnostic, safe for structured clone. */
export type Diagnostic = {
  /** Severity: 1=Error, 2=Warning, 3=Info, 4=Hint. */
  severity: number;
  /** TypeScript error code (e.g. 2322 for type mismatch). */
  code: number;
  /** Human-readable message, pre-flattened from `ts.DiagnosticMessageChain`. */
  message: string;
  /** Character offset in user code where the diagnostic starts. */
  start: number | undefined;
  /** Length of the diagnostic span in characters. */
  length: number | undefined;
};

/** Diagnostics for a single document. */
export type PublishDiagnosticsParams = {
  uri: DocumentUri;
  diagnostics: Diagnostic[];
};

// ---------------------------------------------------------------------------
// Completions
// ---------------------------------------------------------------------------

/** A single completion suggestion, safe for structured clone. */
export type CompletionItem = {
  label: string;
  /** @see ts.ScriptElementKind */
  kind: string;
  sortText: string;
  insertText?: string;
};

/** Result of requesting completions at a position. */
export type CompletionList = {
  items: CompletionItem[];
};

// ---------------------------------------------------------------------------
// Hover
// ---------------------------------------------------------------------------

/** Result of requesting hover info at a position. */
export type Hover = {
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
// Signature Help
// ---------------------------------------------------------------------------

/** A single parameter in a signature. */
export type SignatureParameter = {
  label: string;
  documentation: string;
};

/** A single signature (overload). */
export type SignatureInformation = {
  label: string;
  documentation: string;
  parameters: SignatureParameter[];
};

/** Result of requesting signature help at a position. */
export type SignatureHelp = {
  signatures: SignatureInformation[];
  activeSignature: number;
  activeParameter: number;
} | null;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 messages: main thread → worker
// ---------------------------------------------------------------------------

/** Notifications (fire-and-forget, no response expected). */
type ClientNotification =
  | {
      jsonrpc: "2.0";
      method: "initialize";
      params: { sdcpn: SDCPN };
    }
  | {
      jsonrpc: "2.0";
      method: "sdcpn/didChange";
      params: { sdcpn: SDCPN };
    }
  | {
      jsonrpc: "2.0";
      method: "textDocument/didChange";
      params: {
        textDocument: TextDocumentIdentifier;
        text: string;
      };
    };

/** Requests (expect a response with matching `id`). */
type ClientRequest =
  | {
      jsonrpc: "2.0";
      id: number;
      method: "textDocument/completion";
      params: TextDocumentPositionParams;
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "textDocument/hover";
      params: TextDocumentPositionParams;
    }
  | {
      jsonrpc: "2.0";
      id: number;
      method: "textDocument/signatureHelp";
      params: TextDocumentPositionParams;
    };

/** Any message from the main thread to the worker. */
export type ClientMessage = ClientNotification | ClientRequest;

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 messages: worker → main thread
// ---------------------------------------------------------------------------

/** A successful response to a request. */
type ServerResponse<Result = unknown> =
  | { jsonrpc: "2.0"; id: number; result: Result }
  | { jsonrpc: "2.0"; id: number; error: { code: number; message: string } };

/** Server-initiated notifications (no `id`). */
type ServerNotification = {
  jsonrpc: "2.0";
  method: "textDocument/publishDiagnostics";
  params: PublishDiagnosticsParams[];
};

/** Any message from the worker to the main thread. */
export type ServerMessage = ServerResponse | ServerNotification;
