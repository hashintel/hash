import { useEffect, useRef } from "react";

import type { SDCPN } from "../../core/types/sdcpn";
import type {
  CheckerResult,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./protocol";

type Pending = {
  resolve: (result: CheckerResult) => void;
  reject: (error: Error) => void;
};

/** Methods exposed by the checker WebWorker. */
export type CheckerWorkerApi = {
  /** Validate all user code in an SDCPN model. Runs off the main thread. */
  checkSDCPN: (sdcpn: SDCPN) => Promise<CheckerResult>;
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

    worker.onmessage = (
      event: MessageEvent<JsonRpcResponse<CheckerResult>>,
    ) => {
      const response = event.data;
      const pending = pendingRef.current.get(response.id);
      if (!pending) {
        return;
      }
      pendingRef.current.delete(response.id);

      if ("error" in response) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
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

  const checkSDCPN = (sdcpn: SDCPN): Promise<CheckerResult> => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("Worker not initialized"));
    }

    const id = nextId.current++;
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method: "checkSDCPN",
      params: { sdcpn },
    };

    return new Promise<CheckerResult>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      worker.postMessage(request);
    });
  };

  return { checkSDCPN };
}
