import { use, useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  createLanguageClient,
  type ReadableStore,
  type DiagnosticsSnapshot,
  type LanguageClient,
  type LspWorkerFactory,
} from "@hashintel/petrinaut-core";
import { createLanguageServerWorker } from "@hashintel/petrinaut-core/workers/lsp";

import { createValueStore } from "../create-value-store";
import { SDCPNContext } from "../state/sdcpn-context";
import { useStore } from "../use-store";
import { LanguageClientContext } from "./context";

const EMPTY_DIAGNOSTICS_SNAPSHOT: DiagnosticsSnapshot = {
  byUri: new Map(),
  total: 0,
  errorCount: 0,
};

const EMPTY_DIAGNOSTICS_STORE: ReadableStore<DiagnosticsSnapshot> = {
  get: () => EMPTY_DIAGNOSTICS_SNAPSHOT,
  subscribe: () => () => {},
};

export const LanguageClientProvider: React.FC<{
  children: React.ReactNode;
  /**
   * Optional LSP worker factory. When provided, used instead of the bundled
   * inlined-blob default (which can fail under some host bundler setups when
   * consuming the published dist). Mirrors `simulationWorkerFactory` on
   * SimulationProvider.
   */
  workerFactory?: LspWorkerFactory;
}> = ({ children, workerFactory }) => {
  const { extensions, petriNetDefinition } = use(SDCPNContext);

  /**
   * Create the language client inside a useEffect rather than `useState`'s
   * lazy initializer so React StrictMode's double-invocation doesn't orphan
   * one of two clients (each owning a worker). The effect's cleanup
   * disposes any client that ends up unused, including ones created by
   * StrictMode's simulated remount cycle.
   */
  const [clientStore] = useState(() =>
    createValueStore<LanguageClient | null>(null),
  );
  const client = useSyncExternalStore(
    (listener) => clientStore.subscribe(listener),
    () => clientStore.getSnapshot(),
    () => clientStore.getSnapshot(),
  );

  useEffect(() => {
    const c = createLanguageClient({
      createWorker: workerFactory ?? createLanguageServerWorker,
    });
    clientStore.set(c);
    return () => {
      c.dispose();
      if (clientStore.getSnapshot() === c) {
        clientStore.set(null);
      }
    };
  }, [clientStore, workerFactory]);

  // Sync the SDCPN to the server: initialize on first mount, didChange after.
  const initializedClientRef = useRef<LanguageClient | null>(null);
  useEffect(() => {
    if (!client) {
      return;
    }
    if (initializedClientRef.current !== client) {
      client.initialize(petriNetDefinition, extensions);
      initializedClientRef.current = client;
    } else {
      client.notifySDCPNChanged(petriNetDefinition, extensions);
    }
  }, [extensions, petriNetDefinition, client]);

  // Subscribe to diagnostics from the client. Use an empty fallback store
  // before the client is created so hook order stays stable.
  const {
    byUri: diagnosticsByUri,
    total: totalDiagnosticsCount,
    errorCount: errorDiagnosticsCount,
  } = useStore(client?.diagnostics ?? EMPTY_DIAGNOSTICS_STORE);

  // Before the client lands (StrictMode's first effect cycle gets cleaned
  // up before the worker is wired), fall through to LanguageClientContext's
  // built-in no-op default so children don't have to gate on a separate
  // "loading" branch.
  if (!client) {
    return <>{children}</>;
  }

  const value = {
    diagnosticsByUri,
    totalDiagnosticsCount,
    errorDiagnosticsCount,
    notifyDocumentChanged: client.notifyDocumentChanged,
    requestCompletion: client.requestCompletion,
    requestHover: client.requestHover,
    requestSignatureHelp: client.requestSignatureHelp,
    requestHirArtifacts: client.requestHirArtifacts,
    initializeScenarioSession: client.initializeScenarioSession,
    updateScenarioSession: client.updateScenarioSession,
    killScenarioSession: client.killScenarioSession,
    initializeMetricSession: client.initializeMetricSession,
    updateMetricSession: client.updateMetricSession,
    killMetricSession: client.killMetricSession,
  };

  return (
    <LanguageClientContext value={value}>{children}</LanguageClientContext>
  );
};
