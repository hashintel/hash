import { useCallback, useEffect, useRef } from "react";

import type { SDCPN } from "../../core/types/sdcpn";
import type {
  ClientMessage,
  CompletionList,
  DocumentUri,
  Hover,
  MetricSessionParams,
  Position,
  PublishDiagnosticsParams,
  ScenarioSessionParams,
  ServerMessage,
  SignatureHelp,
} from "./protocol";

/** Dynamically import and instantiate the language server worker as an emitted asset. */
async function createLanguageServerWorker() {
  const LanguageServerWorker = await import(
    "./language-server.worker.ts?worker"
  );
  // eslint-disable-next-line new-cap
  return new LanguageServerWorker.default();
}

type Pending = {
  resolve: (result: never) => void;
  reject: (error: Error) => void;
};

/** Methods exposed by the language client (main-thread side of the worker). */
export type LanguageClientApi = {
  /** Initialize the server with the full SDCPN model (notification, no response). */
  initialize: (sdcpn: SDCPN) => void;
  /** Notify the server that the SDCPN model has changed structurally (notification). */
  notifySDCPNChanged: (sdcpn: SDCPN) => void;
  /** Notify the server that a single document's content changed (notification). */
  notifyDocumentChanged: (uri: DocumentUri, text: string) => void;
  /** Request completions at a position within a document. */
  requestCompletion: (
    uri: DocumentUri,
    position: Position,
  ) => Promise<CompletionList>;
  /** Request hover info at a position within a document. */
  requestHover: (uri: DocumentUri, position: Position) => Promise<Hover | null>;
  /** Request signature help at a position within a document. */
  requestSignatureHelp: (
    uri: DocumentUri,
    position: Position,
  ) => Promise<SignatureHelp | null>;
  /** Initialize a temporary scenario editing session (creates virtual files for expressions). */
  initializeScenarioSession: (params: ScenarioSessionParams) => void;
  /** Update a scenario editing session (re-syncs virtual files for expression type-checking). */
  updateScenarioSession: (params: ScenarioSessionParams) => void;
  /** Kill a scenario editing session (removes virtual files). */
  killScenarioSession: (sessionId: string) => void;
  /** Initialize a temporary metric editing session (creates virtual files for the metric body). */
  initializeMetricSession: (params: MetricSessionParams) => void;
  /** Update a metric editing session (re-syncs virtual files for type-checking). */
  updateMetricSession: (params: MetricSessionParams) => void;
  /** Kill a metric editing session (removes virtual files). */
  killMetricSession: (sessionId: string) => void;
  /** Register a callback for diagnostics pushed from the server. */
  onDiagnostics: (
    callback: (params: PublishDiagnosticsParams[]) => void,
  ) => void;
};

/**
 * Return an LSP-inspired API to interact with the language server WebWorker.
 * The worker is created lazily when diagnostics or language features are requested.
 */
export function useLanguageClient(): LanguageClientApi {
  const isMountedRef = useRef(true);
  const workerRef = useRef<Worker | null>(null);
  const workerPromiseRef = useRef<Promise<Worker> | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextId = useRef(0);
  const queueRef = useRef<object[]>([]);
  const diagnosticsCallbackRef = useRef<
    ((params: PublishDiagnosticsParams[]) => void) | null
  >(null);

  useEffect(() => {
    isMountedRef.current = true;
    const pending = pendingRef.current;

    return () => {
      isMountedRef.current = false;
      workerRef.current?.terminate();
      workerRef.current = null;
      for (const entry of pending.values()) {
        entry.reject(new Error("Worker terminated"));
      }
      pending.clear();
    };
  }, []);

  const attachWorkerListeners = (worker: Worker) => {
    worker.addEventListener("message", (event: MessageEvent<ServerMessage>) => {
      const msg = event.data;

      if ("id" in msg) {
        // Response to a request
        const pending = pendingRef.current.get(msg.id);
        if (!pending) {
          return;
        }
        pendingRef.current.delete(msg.id);

        if ("error" in msg) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result as never);
        }
      } else if ("method" in msg) {
        // Server-pushed notification
        diagnosticsCallbackRef.current?.(msg.params);
      }
    });
  };

  const rejectPendingRequests = (error: Error) => {
    for (const entry of pendingRef.current.values()) {
      entry.reject(error);
    }
    pendingRef.current.clear();
  };

  const ensureWorker = useCallback(async () => {
    if (workerRef.current) {
      return workerRef.current;
    }

    workerPromiseRef.current ??= createLanguageServerWorker().then((worker) => {
      if (!isMountedRef.current) {
        worker.terminate();
        throw new Error("Worker terminated");
      }

      attachWorkerListeners(worker);
      workerRef.current = worker;

      // Drain any messages queued before the worker was ready
      for (const message of queueRef.current) {
        worker.postMessage(message);
      }
      queueRef.current = [];

      return worker;
    });

    return workerPromiseRef.current;
  }, []);

  // --- Notifications (fire-and-forget) ---

  const sendNotification = useCallback(
    (message: Omit<ClientMessage, "id">, options?: { activate: boolean }) => {
      const worker = workerRef.current;
      if (worker) {
        worker.postMessage(message);
        return;
      }

      queueRef.current.push(message);

      if (options?.activate) {
        void ensureWorker().catch((error: unknown) => {
          rejectPendingRequests(
            error instanceof Error
              ? error
              : new Error("Failed to create language worker"),
          );
        });
      }
    },
    [ensureWorker],
  );

  const initialize = useCallback(
    (sdcpn: SDCPN) => {
      sendNotification({
        jsonrpc: "2.0",
        method: "initialize",
        params: { sdcpn },
      });
    },
    [sendNotification],
  );

  const notifySDCPNChanged = useCallback(
    (sdcpn: SDCPN) => {
      sendNotification({
        jsonrpc: "2.0",
        method: "sdcpn/didChange",
        params: { sdcpn },
      });
    },
    [sendNotification],
  );

  const notifyDocumentChanged = useCallback(
    (uri: DocumentUri, text: string) => {
      sendNotification(
        {
          jsonrpc: "2.0",
          method: "textDocument/didChange",
          params: { textDocument: { uri }, text },
        },
        { activate: true },
      );
    },
    [sendNotification],
  );

  const initializeScenarioSession = useCallback(
    (params: ScenarioSessionParams) => {
      sendNotification(
        {
          jsonrpc: "2.0",
          method: "temp/scenario/initialize",
          params,
        },
        { activate: true },
      );
    },
    [sendNotification],
  );

  const updateScenarioSession = useCallback(
    (params: ScenarioSessionParams) => {
      sendNotification(
        {
          jsonrpc: "2.0",
          method: "temp/scenario/didChange",
          params,
        },
        { activate: true },
      );
    },
    [sendNotification],
  );

  const killScenarioSession = useCallback(
    (sessionId: string) => {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/scenario/kill",
        params: { sessionId },
      });
    },
    [sendNotification],
  );

  const initializeMetricSession = useCallback(
    (params: MetricSessionParams) => {
      sendNotification(
        {
          jsonrpc: "2.0",
          method: "temp/metric/initialize",
          params,
        },
        { activate: true },
      );
    },
    [sendNotification],
  );

  const updateMetricSession = useCallback(
    (params: MetricSessionParams) => {
      sendNotification(
        {
          jsonrpc: "2.0",
          method: "temp/metric/didChange",
          params,
        },
        { activate: true },
      );
    },
    [sendNotification],
  );

  const killMetricSession = useCallback(
    (sessionId: string) => {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/metric/kill",
        params: { sessionId },
      });
    },
    [sendNotification],
  );

  // --- Requests (return Promise) ---

  const sendRequest = useCallback(
    <T>(message: ClientMessage): Promise<T> => {
      return new Promise<T>((resolve, reject) => {
        pendingRef.current.set((message as { id: number }).id, {
          resolve: resolve as (result: never) => void,
          reject,
        });
        const worker = workerRef.current;
        if (worker) {
          worker.postMessage(message);
        } else {
          queueRef.current.push(message);
          void ensureWorker().catch((error: unknown) => {
            const pending = pendingRef.current.get(
              (message as { id: number }).id,
            );
            if (pending) {
              pending.reject(
                error instanceof Error
                  ? error
                  : new Error("Failed to create language worker"),
              );
              pendingRef.current.delete((message as { id: number }).id);
            }
          });
        }
      });
    },
    [ensureWorker],
  );

  const requestCompletion = useCallback(
    (uri: DocumentUri, position: Position): Promise<CompletionList> => {
      const id = nextId.current++;
      return sendRequest<CompletionList>({
        jsonrpc: "2.0",
        id,
        method: "textDocument/completion",
        params: { textDocument: { uri }, position },
      });
    },
    [sendRequest],
  );

  const requestHover = useCallback(
    (uri: DocumentUri, position: Position): Promise<Hover | null> => {
      const id = nextId.current++;
      return sendRequest<Hover | null>({
        jsonrpc: "2.0",
        id,
        method: "textDocument/hover",
        params: { textDocument: { uri }, position },
      });
    },
    [sendRequest],
  );

  const requestSignatureHelp = useCallback(
    (uri: DocumentUri, position: Position): Promise<SignatureHelp | null> => {
      const id = nextId.current++;
      return sendRequest<SignatureHelp | null>({
        jsonrpc: "2.0",
        id,
        method: "textDocument/signatureHelp",
        params: { textDocument: { uri }, position },
      });
    },
    [sendRequest],
  );

  const onDiagnostics = useCallback(
    (callback: (params: PublishDiagnosticsParams[]) => void) => {
      diagnosticsCallbackRef.current = callback;
    },
    [],
  );

  return {
    initialize,
    notifySDCPNChanged,
    notifyDocumentChanged,
    initializeScenarioSession,
    updateScenarioSession,
    killScenarioSession,
    initializeMetricSession,
    updateMetricSession,
    killMetricSession,
    requestCompletion,
    requestHover,
    requestSignatureHelp,
    onDiagnostics,
  };
}
