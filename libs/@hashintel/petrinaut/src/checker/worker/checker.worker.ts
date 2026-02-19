/* eslint-disable no-restricted-globals */
/**
 * Checker WebWorker — runs TypeScript validation off the main thread.
 *
 * Receives JSON-RPC requests via `postMessage`, delegates to `checkSDCPN`,
 * serializes the diagnostics (flatten messageText, strip non-cloneable fields),
 * and posts the result back.
 */
import ts from "typescript";

import { checkSDCPN } from "../lib/checker";
import type {
  CheckerDiagnostic,
  CheckerItemDiagnostics,
  CheckerResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol";

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

self.onmessage = ({ data: { id, params } }: MessageEvent<JsonRpcRequest>) => {
  try {
    const raw = checkSDCPN(params.sdcpn);

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
