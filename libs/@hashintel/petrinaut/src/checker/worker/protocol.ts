/**
 * LSP-inspired protocol types for the checker WebWorker.
 *
 * Uses JSON-RPC 2.0 with standard LSP types from `vscode-languageserver-types`.
 * All diagnostic, completion, hover, and signature help types are the official
 * LSP types, serializable for postMessage structured clone.
 *
 * Custom extensions:
 * - `sdcpn/didChange` for structural model changes (not per-document).
 */
import type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  Position,
  SignatureHelp,
  TextDocumentIdentifier,
} from "vscode-languageserver-types";

import type { SDCPN } from "../../core/types/sdcpn";

// Re-export LSP types used by consumers
export type {
  CompletionItem,
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  Position,
  SignatureHelp,
  TextDocumentIdentifier,
};

/**
 * Parameters for `textDocument/publishDiagnostics` notification.
 * Defined here rather than pulling in `vscode-languageserver-protocol`.
 */
export type PublishDiagnosticsParams = {
  uri: DocumentUri;
  diagnostics: Diagnostic[];
};

/** Position in a text document (LSP standard: line/character based). */
export type TextDocumentPositionParams = {
  textDocument: TextDocumentIdentifier;
  position: Position;
};

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
