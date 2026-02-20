/* eslint-disable no-restricted-globals */
/**
 * Checker WebWorker — runs TypeScript validation off the main thread.
 *
 * Receives JSON-RPC requests via `postMessage`, delegates to `checkSDCPN`,
 * serializes the diagnostics (flatten messageText, strip non-cloneable fields),
 * and posts the result back.
 *
 * The LanguageService is persisted between calls so that `getCompletions`
 * can reuse it without re-sending the full SDCPN model.
 */
import ts from "typescript";

import { checkSDCPN } from "../lib/checker";
import {
  createSDCPNLanguageService,
  type SDCPNLanguageService,
} from "../lib/create-sdcpn-language-service";
import { getItemFilePath } from "../lib/file-paths";
import type {
  CheckerCompletionItem,
  CheckerCompletionResult,
  CheckerDiagnostic,
  CheckerItemDiagnostics,
  CheckerQuickInfoResult,
  CheckerResult,
  CheckerSignatureHelpResult,
  CheckerSignatureInfo,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol";

/** Persisted LanguageService — created on `setSDCPN`, reused by `getCompletions`. */
let languageService: SDCPNLanguageService | null = null;

/** Strip `ts.SourceFile` and flatten `DiagnosticMessageChain` for structured clone. */
function serializeDiagnostic(diag: ts.Diagnostic): CheckerDiagnostic {
  return {
    category: diag.category,
    code: diag.code,
    messageText: ts.flattenDiagnosticMessageText(diag.messageText, "\n"),
    start: diag.start,
    length: diag.length,
  };
}

/** Map (itemType, itemId) → checker virtual file path. */
function getCheckerFilePath(
  itemType: CheckerItemDiagnostics["itemType"],
  itemId: string,
): string {
  switch (itemType) {
    case "transition-lambda":
      return getItemFilePath("transition-lambda-code", {
        transitionId: itemId,
      });
    case "transition-kernel":
      return getItemFilePath("transition-kernel-code", {
        transitionId: itemId,
      });
    case "differential-equation":
      return getItemFilePath("differential-equation-code", { id: itemId });
  }
}

self.onmessage = async ({ data }: MessageEvent<JsonRpcRequest>) => {
  const { id, method } = data;

  try {
    switch (method) {
      case "setSDCPN": {
        const { sdcpn } = data.params;

        languageService = createSDCPNLanguageService(sdcpn);
        const raw = checkSDCPN(sdcpn, languageService);

        const result: CheckerResult = {
          isValid: raw.isValid,
          itemDiagnostics: raw.itemDiagnostics.map(
            (item): CheckerItemDiagnostics => ({
              itemId: item.itemId,
              itemType: item.itemType,
              filePath: item.filePath,
              diagnostics: item.diagnostics.map(serializeDiagnostic),
            }),
          ),
        };

        self.postMessage({
          jsonrpc: "2.0",
          id,
          result,
        } satisfies JsonRpcResponse<CheckerResult>);
        break;
      }

      case "getCompletions": {
        const { itemType, itemId, offset } = data.params;

        // Wait before requesting completions, to be sure the file content is updated
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        if (!languageService) {
          self.postMessage({
            jsonrpc: "2.0",
            id,
            result: { items: [] },
          } satisfies JsonRpcResponse<CheckerCompletionResult>);
          break;
        }

        const filePath = getCheckerFilePath(itemType, itemId);
        const completions = languageService.getCompletionsAtPosition(
          filePath,
          offset,
          undefined,
        );

        const items: CheckerCompletionItem[] = (completions?.entries ?? []).map(
          (entry) => ({
            name: entry.name,
            kind: entry.kind,
            sortText: entry.sortText,
            insertText: entry.insertText,
          }),
        );

        self.postMessage({
          jsonrpc: "2.0",
          id,
          result: { items },
        } satisfies JsonRpcResponse<CheckerCompletionResult>);
        break;
      }

      case "getQuickInfo": {
        const { itemType, itemId, offset } = data.params;

        if (!languageService) {
          self.postMessage({
            jsonrpc: "2.0",
            id,
            result: null,
          } satisfies JsonRpcResponse<CheckerQuickInfoResult>);
          break;
        }

        const filePath = getCheckerFilePath(itemType, itemId);
        const info = languageService.getQuickInfoAtPosition(filePath, offset);

        const result: CheckerQuickInfoResult = info
          ? {
              displayParts: ts.displayPartsToString(info.displayParts),
              documentation: ts.displayPartsToString(info.documentation),
              start: info.textSpan.start,
              length: info.textSpan.length,
            }
          : null;

        self.postMessage({
          jsonrpc: "2.0",
          id,
          result,
        } satisfies JsonRpcResponse<CheckerQuickInfoResult>);
        break;
      }

      case "getSignatureHelp": {
        const { itemType, itemId, offset } = data.params;

        // Wait a bit before requesting completions, to be sure the file content is updated
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 50);
        });

        if (!languageService) {
          self.postMessage({
            jsonrpc: "2.0",
            id,
            result: null,
          } satisfies JsonRpcResponse<CheckerSignatureHelpResult>);
          break;
        }

        const filePath = getCheckerFilePath(itemType, itemId);
        const help = languageService.getSignatureHelpItems(
          filePath,
          offset,
          undefined,
        );

        const result: CheckerSignatureHelpResult = help
          ? {
              activeSignature: help.selectedItemIndex,
              activeParameter: help.argumentIndex,
              signatures: help.items.map(
                (item): CheckerSignatureInfo => ({
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

        self.postMessage({
          jsonrpc: "2.0",
          id,
          result,
        } satisfies JsonRpcResponse<CheckerSignatureHelpResult>);
        break;
      }
    }
  } catch (err) {
    self.postMessage({
      jsonrpc: "2.0",
      id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    } satisfies JsonRpcResponse);
  }
};
