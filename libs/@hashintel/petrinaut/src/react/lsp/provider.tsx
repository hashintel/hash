/**
 * @layerRoot react.lsp
 * @role Exposes the core language client to the editor as React context
 */

import { use, useEffect, useRef, useState } from "react";

import {
  createLanguageClient,
  createReadableStore,
  type LanguageClient,
  type LspWorkerFactory,
} from "@hashintel/petrinaut-core";
import { createLanguageServerWorker } from "@hashintel/petrinaut-core/workers/lsp";

import { SDCPNContext } from "../document/sdcpn-context";
import { useExecutableDefinition } from "../document/use-executable-definition";
import { constantStore, useStore } from "../shared/use-store";
import {
  DEFAULT_LANGUAGE_CLIENT_CONTEXT,
  EMPTY_DIAGNOSTICS_SNAPSHOT,
  LanguageClientContext,
} from "./context";

const EMPTY_DIAGNOSTICS_STORE = constantStore(EMPTY_DIAGNOSTICS_SNAPSHOT);

export const LanguageClientProvider: React.FC<{
  children: React.ReactNode;
  /**
   * Optional LSP worker factory. When provided, used instead of the bundled
   * inlined-blob default (which can fail under some host bundler setups when
   * consuming the published dist). Mirrors `eventSimulationWorkerFactory`
   * on PetrinautProvider.
   */
  workerFactory?: LspWorkerFactory;
}> = ({ children, workerFactory }) => {
  const { extensions } = use(SDCPNContext);
  // Code is checked against the net that runs: the ports of a component of
  // an import are places only once it is inlined.
  const petriNetDefinition = useExecutableDefinition();

  /**
   * Create the language client inside a useEffect rather than `useState`'s
   * lazy initializer so React StrictMode's double-invocation doesn't orphan
   * one of two clients (each owning a worker). The effect's cleanup
   * disposes any client that ends up unused, including ones created by
   * StrictMode's simulated remount cycle.
   */
  const [clientStore] = useState(() =>
    createReadableStore<LanguageClient | null>(null),
  );
  const client = useStore(clientStore);

  useEffect(() => {
    const c = createLanguageClient({
      createWorker: workerFactory ?? createLanguageServerWorker,
    });
    clientStore.set(c);
    return () => {
      c.dispose();
      if (clientStore.get() === c) {
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
  const diagnostics = useStore(client?.diagnostics ?? EMPTY_DIAGNOSTICS_STORE);

  // Before the client lands (StrictMode's first effect cycle gets cleaned
  // up before the worker is wired), provide LanguageClientContext's no-op
  // default so children don't have to gate on a separate "loading" branch.
  // Both branches render the provider, so the subtree stays mounted when the
  // client lands.
  if (!client) {
    return (
      <LanguageClientContext value={DEFAULT_LANGUAGE_CLIENT_CONTEXT}>
        {children}
      </LanguageClientContext>
    );
  }

  const value = {
    diagnostics,
    diagnosticsByUri: diagnostics.byUri,
    totalDiagnosticsCount: diagnostics.total,
    errorDiagnosticsCount: diagnostics.errorCount,
    notifyDocumentChanged: client.notifyDocumentChanged,
    requestCompletion: client.requestCompletion,
    requestHover: client.requestHover,
    requestSignatureHelp: client.requestSignatureHelp,
    requestDiagnostics: client.requestDiagnostics,
    netAnalysis: client.netAnalysis,
    requestHirArtifacts: client.requestHirArtifacts,
    requestScenarioHir: client.requestScenarioHir,
    requestFormatExpression: client.requestFormatExpression,
    requestConstraint: client.requestConstraint,
    requestVisualizerHir: client.requestVisualizerHir,
    initializeMetricSession: client.initializeMetricSession,
    initializeAdHocSession: client.initializeAdHocSession,
    updateAdHocSession: client.updateAdHocSession,
    killAdHocSession: client.killAdHocSession,
    updateMetricSession: client.updateMetricSession,
    killMetricSession: client.killMetricSession,
    initializeConstraintSession: client.initializeConstraintSession,
    updateConstraintSession: client.updateConstraintSession,
    killConstraintSession: client.killConstraintSession,
  };

  return (
    <LanguageClientContext value={value}>{children}</LanguageClientContext>
  );
};
