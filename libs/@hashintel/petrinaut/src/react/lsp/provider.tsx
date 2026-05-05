import { use, useEffect, useState } from "react";

import type { ReadableStore } from "../../core/handle";
import {
  createLanguageClient,
  type DiagnosticsSnapshot,
  type LanguageClient,
} from "../../core/lsp";
import type { LspWorkerFactory } from "../../core/lsp/transport";
import { SDCPNContext } from "../state/sdcpn-context";
import { useStore } from "../use-store";
import { LanguageClientContext } from "./context";

/** Dynamically import and instantiate the language server worker (inlined as blob URL). */
async function createLanguageServerWorker(): Promise<Worker> {
  // eslint-disable-next-line no-console
  console.log("[lsp] default createLanguageServerWorker invoked — importing");
  const LanguageServerWorker = await import(
    "../../core/lsp/worker/language-server.worker.ts?worker&inline"
  );
  // eslint-disable-next-line no-console
  console.log("[lsp] default createLanguageServerWorker — constructing", {
    hasDefault: typeof LanguageServerWorker.default,
  });
  // eslint-disable-next-line new-cap
  return new LanguageServerWorker.default();
}

const EMPTY_DIAGNOSTICS_SNAPSHOT: DiagnosticsSnapshot = {
  byUri: new Map(),
  total: 0,
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
  const { petriNetDefinition } = use(SDCPNContext);

  /**
   * Create the language client inside a useEffect rather than `useState`'s
   * lazy initializer so React StrictMode's double-invocation doesn't orphan
   * one of two clients (each owning a worker). The effect's cleanup
   * disposes any client that ends up unused, including ones created by
   * StrictMode's simulated remount cycle.
   */
  const [client, setClient] = useState<LanguageClient | null>(null);

  useEffect(() => {
    const c = createLanguageClient({
      createWorker: workerFactory ?? createLanguageServerWorker,
    });
    setClient(c);
    return () => {
      c.dispose();
      setClient((current) => (current === c ? null : current));
    };
  }, [workerFactory]);

  // Sync the SDCPN to the server: initialize on first mount, didChange after.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!client) {
      return;
    }
    if (!initialized) {
      client.initialize(petriNetDefinition);
      setInitialized(true);
    } else {
      client.notifySDCPNChanged(petriNetDefinition);
    }
  }, [petriNetDefinition, client, initialized]);

  // Subscribe to diagnostics from the client. Use an empty fallback store
  // before the client is created so hook order stays stable.
  const { byUri: diagnosticsByUri, total: totalDiagnosticsCount } = useStore(
    client?.diagnostics ?? EMPTY_DIAGNOSTICS_STORE,
  );

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
    notifyDocumentChanged: client.notifyDocumentChanged,
    requestCompletion: client.requestCompletion,
    requestHover: client.requestHover,
    requestSignatureHelp: client.requestSignatureHelp,
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
