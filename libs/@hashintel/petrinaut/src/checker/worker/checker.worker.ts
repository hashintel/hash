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
import {
  type CompletionItem,
  type CompletionList,
  type Hover,
  MarkupKind,
  Range,
  type SignatureHelp,
  type SignatureInformation,
} from "vscode-languageserver-types";

import type { SDCPN } from "../../core/types/sdcpn";
import { checkSDCPN } from "../lib/checker";
import { SDCPNLanguageServer } from "../lib/create-sdcpn-language-service";
import { filePathToUri, uriToFilePath } from "../lib/document-uris";
import { offsetToPosition, positionToOffset } from "../lib/position-utils";
import { serializeDiagnostic, toCompletionItemKind } from "../lib/ts-to-lsp";
import type {
  ClientMessage,
  PublishDiagnosticsParams,
  ServerMessage,
} from "./protocol";

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
      const fileContent = server!.getFileContent(item.filePath) ?? "";
      return {
        uri: uri ?? item.filePath,
        diagnostics: item.diagnostics.map((diag) =>
          serializeDiagnostic(diag, fileContent),
        ),
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
        server ??= new SDCPNLanguageServer();
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
          respond(id, {
            isIncomplete: false,
            items: [],
          } satisfies CompletionList);
          break;
        }

        const filePath = uriToFilePath(data.params.textDocument.uri);
        if (!filePath) {
          respond(id, {
            isIncomplete: false,
            items: [],
          } satisfies CompletionList);
          break;
        }

        const fileContent = server.getFileContent(filePath) ?? "";
        const offset = positionToOffset(fileContent, data.params.position);

        const completions = server.getCompletionsAtPosition(
          filePath,
          offset,
          undefined,
        );

        const items: CompletionItem[] = (completions?.entries ?? []).map(
          (entry) => ({
            label: entry.name,
            kind: toCompletionItemKind(entry.kind),
            sortText: entry.sortText,
            insertText: entry.insertText,
          }),
        );

        respond(id, { isIncomplete: false, items } satisfies CompletionList);
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

        const fileContent = server.getFileContent(filePath) ?? "";
        const offset = positionToOffset(fileContent, data.params.position);

        const info = server.getQuickInfoAtPosition(filePath, offset);

        const result: Hover | null = info
          ? {
              contents: {
                kind: MarkupKind.Markdown,
                value: [
                  `\`\`\`typescript\n${ts.displayPartsToString(info.displayParts)}\n\`\`\``,
                  ts.displayPartsToString(info.documentation),
                ]
                  .filter(Boolean)
                  .join("\n\n"),
              },
              range: Range.create(
                offsetToPosition(fileContent, info.textSpan.start),
                offsetToPosition(
                  fileContent,
                  info.textSpan.start + info.textSpan.length,
                ),
              ),
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

        const fileContent = server.getFileContent(filePath) ?? "";
        const offset = positionToOffset(fileContent, data.params.position);

        const help = server.getSignatureHelpItems(filePath, offset, undefined);

        const result: SignatureHelp | null = help
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
                  documentation: {
                    kind: MarkupKind.PlainText,
                    value: ts.displayPartsToString(item.documentation),
                  },
                  parameters: item.parameters.map((param) => ({
                    label: ts.displayPartsToString(param.displayParts),
                    documentation: {
                      kind: MarkupKind.PlainText,
                      value: ts.displayPartsToString(param.documentation),
                    },
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
