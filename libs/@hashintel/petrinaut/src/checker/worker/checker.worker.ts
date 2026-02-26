/* eslint-disable no-restricted-globals */
/**
 * Checker WebWorker — runs TypeScript validation off the main thread.
 *
 * Implements an LSP-inspired protocol over JSON-RPC 2.0:
 * - Notifications: `initialize`, `sdcpn/didChange`, `textDocument/didChange`
 * - Requests: `textDocument/completion`, `textDocument/hover`, `textDocument/signatureHelp`
 * - Server push: `textDocument/publishDiagnostics`
 *
 * The LanguageService is created once and reused across SDCPN changes.
 */
import ts from "typescript";

import type { SDCPN } from "../../core/types/sdcpn";
import { checkSDCPN } from "../lib/checker";
import { SDCPNLanguageServer } from "../lib/create-sdcpn-language-service";
import { getItemFilePath } from "../lib/file-paths";
import type {
  ClientMessage,
  CompletionItem,
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  PublishDiagnosticsParams,
  ServerMessage,
  SignatureHelp,
  SignatureInformation,
} from "./protocol";

// ---------------------------------------------------------------------------
// URI ↔ internal file path mapping
// ---------------------------------------------------------------------------

const TRANSITION_LAMBDA_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/lambda\.ts$/;
const TRANSITION_KERNEL_URI_RE =
  /^inmemory:\/\/sdcpn\/transitions\/([^/]+)\/kernel\.ts$/;
const DE_URI_RE = /^inmemory:\/\/sdcpn\/differential-equations\/([^/]+)\.ts$/;

/** Convert a document URI to the internal virtual file path used by the TS LanguageService. */
function uriToFilePath(uri: DocumentUri): string | null {
  let match = TRANSITION_LAMBDA_URI_RE.exec(uri);
  if (match) {
    return getItemFilePath("transition-lambda-code", {
      transitionId: match[1]!,
    });
  }

  match = TRANSITION_KERNEL_URI_RE.exec(uri);
  if (match) {
    return getItemFilePath("transition-kernel-code", {
      transitionId: match[1]!,
    });
  }

  match = DE_URI_RE.exec(uri);
  if (match) {
    return getItemFilePath("differential-equation-code", { id: match[1]! });
  }

  return null;
}

const TRANSITION_LAMBDA_PATH_RE = /^\/transitions\/([^/]+)\/lambda\/code\.ts$/;
const TRANSITION_KERNEL_PATH_RE = /^\/transitions\/([^/]+)\/kernel\/code\.ts$/;
const DE_PATH_RE = /^\/differential_equations\/([^/]+)\/code\.ts$/;

/** Convert an internal file path to the document URI used by Monaco. */
function filePathToUri(filePath: string): DocumentUri | null {
  let match = TRANSITION_LAMBDA_PATH_RE.exec(filePath);
  if (match) {
    return `inmemory://sdcpn/transitions/${match[1]!}/lambda.ts`;
  }

  match = TRANSITION_KERNEL_PATH_RE.exec(filePath);
  if (match) {
    return `inmemory://sdcpn/transitions/${match[1]!}/kernel.ts`;
  }

  match = DE_PATH_RE.exec(filePath);
  if (match) {
    return `inmemory://sdcpn/differential-equations/${match[1]!}.ts`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Serialization helpers
// ---------------------------------------------------------------------------

/**
 * Map `ts.DiagnosticCategory` to LSP-like severity.
 * TS: 0=Warning, 1=Error, 2=Suggestion, 3=Message
 * LSP: 1=Error, 2=Warning, 3=Information, 4=Hint
 */
function toLspSeverity(category: number): number {
  switch (category) {
    case 0:
      return 2; // Warning
    case 1:
      return 1; // Error
    case 2:
      return 4; // Hint (Suggestion)
    case 3:
      return 3; // Information (Message)
    default:
      return 1;
  }
}

function serializeDiagnostic(diag: ts.Diagnostic): Diagnostic {
  return {
    severity: toLspSeverity(diag.category),
    code: diag.code,
    message: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
    start: diag.start,
    length: diag.length,
  };
}

// ---------------------------------------------------------------------------
// Server state
// ---------------------------------------------------------------------------

let server: SDCPNLanguageServer | null = null;

function respond(id: number, result: unknown): void {
  self.postMessage({
    jsonrpc: "2.0",
    id,
    result,
  } satisfies ServerMessage);
}

function respondError(id: number, message: string): void {
  self.postMessage({
    jsonrpc: "2.0",
    id,
    error: { code: -32603, message },
  } satisfies ServerMessage);
}

/** Run diagnostics on all SDCPN code files and push results to the main thread. */
function publishAllDiagnostics(sdcpn: SDCPN): void {
  if (!server) {
    return;
  }

  const result = checkSDCPN(sdcpn, server);
  const params: PublishDiagnosticsParams[] = result.itemDiagnostics.map(
    (item) => {
      const uri = filePathToUri(item.filePath);
      return {
        uri: uri ?? item.filePath,
        diagnostics: item.diagnostics.map(serializeDiagnostic),
      };
    },
  );

  self.postMessage({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params,
  } satisfies ServerMessage);
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

/** Cache the last SDCPN for re-running diagnostics after single-file changes. */
let lastSDCPN: SDCPN | null = null;

self.onmessage = ({ data }: MessageEvent<ClientMessage>) => {
  try {
    switch (data.method) {
      // --- Notifications (no response) ---

      case "initialize": {
        const { sdcpn } = data.params;
        lastSDCPN = sdcpn;
        server = new SDCPNLanguageServer();
        server.syncFiles(sdcpn);
        publishAllDiagnostics(sdcpn);
        break;
      }

      case "sdcpn/didChange": {
        const { sdcpn } = data.params;
        lastSDCPN = sdcpn;
        if (!server) {
          server = new SDCPNLanguageServer();
        }
        server.syncFiles(sdcpn);
        publishAllDiagnostics(sdcpn);
        break;
      }

      case "textDocument/didChange": {
        if (!server) {
          break;
        }
        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (filePath) {
          server.updateDocumentContent(filePath, data.params.text);
          // Re-run full diagnostics since type changes can cascade
          if (lastSDCPN) {
            publishAllDiagnostics(lastSDCPN);
          }
        }
        break;
      }

      // --- Requests (send response) ---

      case "textDocument/completion": {
        const { id } = data;
        if (!server) {
          respond(id, { items: [] } satisfies CompletionList);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, { items: [] } satisfies CompletionList);
          break;
        }

        const completions = server.getCompletionsAtPosition(
          filePath,
          data.params.offset,
          undefined,
        );

        const items: CompletionItem[] = (completions?.entries ?? []).map(
          (entry) => ({
            label: entry.name,
            kind: entry.kind,
            sortText: entry.sortText,
            insertText: entry.insertText,
          }),
        );

        respond(id, { items } satisfies CompletionList);
        break;
      }

      case "textDocument/hover": {
        const { id } = data;
        if (!server) {
          respond(id, null);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, null);
          break;
        }

        const info = server.getQuickInfoAtPosition(
          filePath,
          data.params.offset,
        );

        const result: Hover = info
          ? {
              displayParts: ts.displayPartsToString(info.displayParts),
              documentation: ts.displayPartsToString(info.documentation),
              start: info.textSpan.start,
              length: info.textSpan.length,
            }
          : null;

        respond(id, result);
        break;
      }

      case "textDocument/signatureHelp": {
        const { id } = data;
        if (!server) {
          respond(id, null);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, null);
          break;
        }

        const help = server.getSignatureHelpItems(
          filePath,
          data.params.offset,
          undefined,
        );

        const result: SignatureHelp = help
          ? {
              activeSignature: help.selectedItemIndex,
              activeParameter: help.argumentIndex,
              signatures: help.items.map(
                (item): SignatureInformation => ({
                  label: [
                    ...item.prefixDisplayParts,
                    ...item.parameters.flatMap((param, idx) => [
                      ...(idx > 0 ? item.separatorDisplayParts : []),
                      ...param.displayParts,
                    ]),
                    ...item.suffixDisplayParts,
                  ]
                    .map((part) => part.text)
                    .join(""),
                  documentation: ts.displayPartsToString(item.documentation),
                  parameters: item.parameters.map((param) => ({
                    label: ts.displayPartsToString(param.displayParts),
                    documentation: ts.displayPartsToString(param.documentation),
                  })),
                }),
              ),
            }
          : null;

        respond(id, result);
        break;
      }
    }
  } catch (err) {
    // Only requests have an `id` that needs a response
    if ("id" in data) {
      respondError(data.id, err instanceof Error ? err.message : String(err));
    }
  }
};
