import { useCallback, useEffect, useRef } from "react";

import type { SDCPN } from "../../core/types/sdcpn";
import type {
  ClientMessage,
  CompletionList,
  DocumentUri,
  Hover,
  Position,
  PublishDiagnosticsParams,
  ServerMessage,
  SignatureHelp,
} from "./protocol";

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
  /** Register a callback for diagnostics pushed from the server. */
  onDiagnostics: (
    callback: (params: PublishDiagnosticsParams[]) => void,
  ) => void;
};

/**
 * Spawn the language server WebWorker and return an LSP-inspired API to interact with it.
 * The worker is created on mount and terminated on unmount.
 */
export function useLanguageClient(): LanguageClientApi {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, Pending>());
  const nextId = useRef(0);
  const diagnosticsCallbackRef = useRef<
    ((params: PublishDiagnosticsParams[]) => void) | null
  >(null);

  useEffect(() => {
    const worker = new Worker(
      new URL("./language-server.worker.ts", import.meta.url),
      {
        type: "module",
      },
    );

    worker.onmessage = (event: MessageEvent<ServerMessage>) => {
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

  // --- Notifications (fire-and-forget) ---

  const sendNotification = useCallback((message: Omit<ClientMessage, "id">) => {
    workerRef.current?.postMessage(message);
  }, []);

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
      sendNotification({
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: { textDocument: { uri }, text },
      });
    },
    [sendNotification],
  );

  // --- Requests (return Promise) ---

  const sendRequest = useCallback(<T>(message: ClientMessage): Promise<T> => {
    const worker = workerRef.current;
    if (!worker) {
      return Promise.reject(new Error("Worker not initialized"));
    }

    return new Promise<T>((resolve, reject) => {
      pendingRef.current.set((message as { id: number }).id, {
        resolve: resolve as (result: never) => void,
        reject,
      });
      worker.postMessage(message);
    });
  }, []);

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
    requestCompletion,
    requestHover,
    requestSignatureHelp,
    onDiagnostics,
  };
}
