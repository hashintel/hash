import { DiagnosticSeverity } from "vscode-languageserver-types";

import {
  createWorkerLspTransport,
  type LspTransport,
  type LspWorkerFactory,
} from "./transport";

import type { PetrinautExtensionSettings } from "../extensions";
// Type-only: must not pull the compiler (`typescript`) into client bundles.
import type { HirCompileResult } from "../hir";
import type { ReadableStore } from "../store";
import type { SDCPN } from "../types/sdcpn";
import type {
  ClientMessage,
  MetricSessionParams,
  PublishDiagnosticsParams,
  ScenarioSessionParams,
} from "./worker/protocol";
import type {
  CompletionList,
  Diagnostic,
  DocumentUri,
  Hover,
  Position,
  SignatureHelp,
} from "vscode-languageserver-types";

export type DiagnosticsSnapshot = {
  byUri: Map<DocumentUri, Diagnostic[]>;
  total: number;
  /**
   * Error-severity diagnostics only. Use this (not `total`) to decide whether
   * the net is simulatable — warnings/hints (e.g. HIR semantic lints) don't
   * block running.
   */
  errorCount: number;
};

/**
 * `this: void` on every method makes the methods safe to pass as references
 * (e.g. `<X onChange={client.notifyDocumentChanged} />`) without `this`-loss
 * concerns. See [06-react-bindings.md §6.3]. Same applies to {@link import("../instance").Petrinaut}
 * and the simulation handle (planned cleanup).
 */
export interface LanguageClient {
  /** Per-URI diagnostics pushed from the server, plus a total count. */
  readonly diagnostics: ReadableStore<DiagnosticsSnapshot>;

  // --- Notifications (fire-and-forget) ---
  initialize(
    this: void,
    sdcpn: SDCPN,
    extensions?: PetrinautExtensionSettings,
  ): void;
  notifySDCPNChanged(
    this: void,
    sdcpn: SDCPN,
    extensions?: PetrinautExtensionSettings,
  ): void;
  notifyDocumentChanged(this: void, uri: DocumentUri, text: string): void;

  initializeScenarioSession(this: void, params: ScenarioSessionParams): void;
  updateScenarioSession(this: void, params: ScenarioSessionParams): void;
  killScenarioSession(this: void, sessionId: string): void;

  initializeMetricSession(this: void, params: MetricSessionParams): void;
  updateMetricSession(this: void, params: MetricSessionParams): void;
  killMetricSession(this: void, sessionId: string): void;

  // --- Requests (return Promise) ---
  requestCompletion(
    this: void,
    uri: DocumentUri,
    position: Position,
  ): Promise<CompletionList>;
  requestHover(
    this: void,
    uri: DocumentUri,
    position: Position,
  ): Promise<Hover | null>;
  requestSignatureHelp(
    this: void,
    uri: DocumentUri,
    position: Position,
  ): Promise<SignatureHelp | null>;
  /**
   * Compiles the SDCPN's user code to HIR artifacts (in the worker, where the
   * TypeScript frontend lives). Pass the result as `hirArtifacts` when
   * starting simulations/experiments — the engine has no compiler of its own.
   */
  requestHirArtifacts(
    this: void,
    sdcpn: SDCPN,
    extensions?: PetrinautExtensionSettings,
  ): Promise<HirCompileResult>;

  /**
   * Tear down the transport. Pending requests reject with "Worker terminated".
   * Idempotent.
   */
  dispose(this: void): void;
}

export type CreateLanguageClientConfig =
  | { createWorker: LspWorkerFactory; transport?: never }
  | { transport: LspTransport; createWorker?: never };

const EMPTY_DIAGNOSTICS: DiagnosticsSnapshot = {
  byUri: new Map(),
  total: 0,
  errorCount: 0,
};

function createReadableStore<T>(initial: T): ReadableStore<T> & {
  set(next: T): void;
} {
  let current = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      if (Object.is(next, current)) {
        return;
      }
      current = next;
      for (const listener of listeners) {
        listener(current);
      }
    },
  };
}

function buildSnapshot(
  allParams: PublishDiagnosticsParams[],
): DiagnosticsSnapshot {
  const byUri = new Map<DocumentUri, Diagnostic[]>();
  let total = 0;
  let errorCount = 0;
  for (const param of allParams) {
    if (param.diagnostics.length === 0) {
      continue;
    }
    byUri.set(param.uri, param.diagnostics);
    total += param.diagnostics.length;
    for (const diagnostic of param.diagnostics) {
      if (diagnostic.severity === DiagnosticSeverity.Error) {
        errorCount += 1;
      }
    }
  }
  return { byUri, total, errorCount };
}

/**
 * Build a {@link LanguageClient} that talks to a language-server worker.
 *
 * Either pass a `createWorker` factory (the function builds a transport) or a
 * pre-built `transport` (ownership transfers — `dispose()` will terminate it).
 */
export function createLanguageClient(
  config: CreateLanguageClientConfig,
): LanguageClient {
  const transport: LspTransport =
    "transport" in config && config.transport !== undefined
      ? config.transport
      : createWorkerLspTransport(config.createWorker);

  type Pending = {
    resolve: (result: never) => void;
    reject: (error: Error) => void;
  };
  const pending = new Map<number, Pending>();
  let nextId = 0;
  let disposed = false;

  const diagnostics =
    createReadableStore<DiagnosticsSnapshot>(EMPTY_DIAGNOSTICS);

  transport.onMessage((msg) => {
    if ("id" in msg) {
      const entry = pending.get(msg.id);
      if (!entry) {
        return;
      }
      pending.delete(msg.id);
      if ("error" in msg) {
        entry.reject(new Error(msg.error.message));
      } else {
        entry.resolve(msg.result as never);
      }
    } else if ("method" in msg) {
      diagnostics.set(buildSnapshot(msg.params));
    }
  });

  function sendNotification(message: Omit<ClientMessage, "id">): void {
    if (disposed) {
      return;
    }
    transport.send(message as ClientMessage);
  }

  function sendRequest<T>(
    method: ClientMessage["method"],
    params: unknown,
  ): Promise<T> {
    if (disposed) {
      return Promise.reject(new Error("LanguageClient disposed"));
    }
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: resolve as (result: never) => void,
        reject,
      });
      transport.send({
        jsonrpc: "2.0",
        id,
        method,
        params,
      } as ClientMessage);
    });
  }

  return {
    diagnostics,

    initialize(sdcpn, extensions) {
      sendNotification({
        jsonrpc: "2.0",
        method: "initialize",
        params: { sdcpn, extensions },
      });
    },
    notifySDCPNChanged(sdcpn, extensions) {
      sendNotification({
        jsonrpc: "2.0",
        method: "sdcpn/didChange",
        params: { sdcpn, extensions },
      });
    },
    notifyDocumentChanged(uri, text) {
      sendNotification({
        jsonrpc: "2.0",
        method: "textDocument/didChange",
        params: { textDocument: { uri }, text },
      });
    },

    initializeScenarioSession(params) {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/scenario/initialize",
        params,
      });
    },
    updateScenarioSession(params) {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/scenario/didChange",
        params,
      });
    },
    killScenarioSession(sessionId) {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/scenario/kill",
        params: { sessionId },
      });
    },

    initializeMetricSession(params) {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/metric/initialize",
        params,
      });
    },
    updateMetricSession(params) {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/metric/didChange",
        params,
      });
    },
    killMetricSession(sessionId) {
      sendNotification({
        jsonrpc: "2.0",
        method: "temp/metric/kill",
        params: { sessionId },
      });
    },

    requestCompletion(uri, position) {
      return sendRequest<CompletionList>("textDocument/completion", {
        textDocument: { uri },
        position,
      });
    },
    requestHover(uri, position) {
      return sendRequest<Hover | null>("textDocument/hover", {
        textDocument: { uri },
        position,
      });
    },
    requestSignatureHelp(uri, position) {
      return sendRequest<SignatureHelp | null>("textDocument/signatureHelp", {
        textDocument: { uri },
        position,
      });
    },
    requestHirArtifacts(sdcpn, extensions) {
      return sendRequest<HirCompileResult>("sdcpn/compileHirArtifacts", {
        sdcpn,
        extensions,
      });
    },

    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const entry of pending.values()) {
        entry.reject(new Error("Worker terminated"));
      }
      pending.clear();
      transport.terminate();
    },
  };
}
