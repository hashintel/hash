import { use, useEffect, useState } from "react";

import { createLanguageClient } from "../../core/lsp";
import { useStore } from "../use-store";
import { SDCPNContext } from "../state/sdcpn-context";
import { LanguageClientContext } from "./context";

/** Dynamically import and instantiate the language server worker (inlined as blob URL). */
async function createLanguageServerWorker(): Promise<Worker> {
  const LanguageServerWorker = await import(
    "../../core/lsp/worker/language-server.worker.ts?worker&inline"
  );
  // eslint-disable-next-line new-cap
  return new LanguageServerWorker.default();
}

export const LanguageClientProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { petriNetDefinition } = use(SDCPNContext);

  // The client owns the worker lifecycle. `useState` lazy-init creates it
  // once per mount (React Compiler is happy with this pattern; refs written
  // during render are rejected).
  const [client] = useState(() =>
    createLanguageClient({ createWorker: createLanguageServerWorker }),
  );

  useEffect(() => {
    return () => {
      client.dispose();
    };
  }, [client]);

  // Sync the SDCPN to the server: initialize on first mount, didChange after.
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized) {
      client.initialize(petriNetDefinition);
      setInitialized(true);
    } else {
      client.notifySDCPNChanged(petriNetDefinition);
    }
  }, [petriNetDefinition, client, initialized]);

  // Subscribe to diagnostics from the client.
  const { byUri: diagnosticsByUri, total: totalDiagnosticsCount } = useStore(
    client.diagnostics,
  );

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
