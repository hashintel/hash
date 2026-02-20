import { useCallback, useEffect, useRef } from "react";

import type { SDCPN } from "../../core/types/sdcpn";
import type {
  CheckerCompletionResult,
  CheckerItemDiagnostics,
  CheckerQuickInfoResult,
  CheckerResult,
  CheckerSignatureHelpResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol";

type Pending = {
  resolve: (result: never) => void;
  reject: (error: Error) => void;
};

/** Methods exposed by the checker WebWorker. */
export type CheckerWorkerApi = {
  /** Send an SDCPN model to the worker. Persists the LanguageService and returns diagnostics. */
  setSDCPN: (sdcpn: SDCPN) => Promise<CheckerResult>;
  /** Request completions at a position within an SDCPN item. */
  getCompletions: (
    itemType: CheckerItemDiagnostics["itemType"],
    itemId: string,
    offset: number,
  ) => Promise<CheckerCompletionResult>;
  /** Request quick info (hover) at a position within an SDCPN item. */
  getQuickInfo: (
    itemType: CheckerItemDiagnostics["itemType"],
    itemId: string,
    offset: number,
  ) => Promise<CheckerQuickInfoResult>;
  /** Request signature help at a position within an SDCPN item. */
  getSignatureHelp: (
    itemType: CheckerItemDiagnostics["itemType"],
    itemId: string,
    offset: number,
  ) => Promise<CheckerSignatureHelpResult>;
};

/**
 * Spawn a checker WebWorker and return a Promise-based API to interact with it.
 * The worker is created on mount and terminated on unmount.
 */
export function useCheckerWorker(): CheckerWorkerApi {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextId = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("./checker.worker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<JsonRpcResponse>) => {
      const response = event.data;
      const pending = pendingRef.current.get(response.id);
      if (!pending) {
        return;
      }
      pendingRef.current.delete(response.id);

      if ("error" in response) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result as never);
      }
    };

    workerRef.current = worker;
    const pending = pendingRef.current;

    return () => {
      worker.terminate();
      workerRef.current = null;
      for (const entry of pending.values()) {
        entry.reject(new Error("Worker terminated"));
      }
      pending.clear();
    };
  }, []);

  const sendRequest = useCallback(<T>(request: JsonRpcRequest): Promise<T> => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("Worker not initialized"));
    }

    return new Promise<T>((resolve, reject) => {
      pendingRef.current.set(request.id, {
        resolve: resolve as (result: never) => void,
        reject,
      });
      worker.postMessage(request);
    });
  }, []);

  const setSDCPN = useCallback(
    (sdcpn: SDCPN): Promise<CheckerResult> => {
      const id = nextId.current++;
      return sendRequest<CheckerResult>({
        jsonrpc: "2.0",
        id,
        method: "setSDCPN",
        params: { sdcpn },
      });
    },
    [sendRequest],
  );

  const getCompletions = useCallback(
    (
      itemType: CheckerItemDiagnostics["itemType"],
      itemId: string,
      offset: number,
    ): Promise<CheckerCompletionResult> => {
      const id = nextId.current++;
      return sendRequest<CheckerCompletionResult>({
        jsonrpc: "2.0",
        id,
        method: "getCompletions",
        params: { itemType, itemId, offset },
      });
    },
    [sendRequest],
  );

  const getQuickInfo = useCallback(
    (
      itemType: CheckerItemDiagnostics["itemType"],
      itemId: string,
      offset: number,
    ): Promise<CheckerQuickInfoResult> => {
      const id = nextId.current++;
      return sendRequest<CheckerQuickInfoResult>({
        jsonrpc: "2.0",
        id,
        method: "getQuickInfo",
        params: { itemType, itemId, offset },
      });
    },
    [sendRequest],
  );

  const getSignatureHelp = useCallback(
    (
      itemType: CheckerItemDiagnostics["itemType"],
      itemId: string,
      offset: number,
    ): Promise<CheckerSignatureHelpResult> => {
      const id = nextId.current++;
      return sendRequest<CheckerSignatureHelpResult>({
        jsonrpc: "2.0",
        id,
        method: "getSignatureHelp",
        params: { itemType, itemId, offset },
      });
    },
    [sendRequest],
  );

  return { setSDCPN, getCompletions, getQuickInfo, getSignatureHelp };
}
