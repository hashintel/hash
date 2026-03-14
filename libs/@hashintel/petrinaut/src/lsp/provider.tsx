import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getSDCPNLanguage } from "../core/types/sdcpn";
import { SDCPNContext } from "../state/sdcpn-context";
import { LanguageClientContext } from "./context";
import type {
  Diagnostic,
  DocumentUri,
  PublishDiagnosticsParams,
} from "./worker/protocol";
import { useLanguageClient } from "./worker/use-language-client";
import { usePyrightClient } from "./worker/use-pyright-client";

/** Build an immutable diagnostics map, excluding empty entries. */
function buildDiagnosticsMap(
  allParams: PublishDiagnosticsParams[],
): Map<DocumentUri, Diagnostic[]> {
  return new Map(
    allParams
      .filter((param) => param.diagnostics.length > 0)
      .map((param) => [param.uri, param.diagnostics]),
  );
}

/** Count total diagnostics across all URIs. */
function countDiagnostics(
  diagnosticsByUri: Map<DocumentUri, Diagnostic[]>,
): number {
  let count = 0;
  for (const diagnostics of diagnosticsByUri.values()) {
    count += diagnostics.length;
  }
  return count;
}

export const LanguageClientProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const language = getSDCPNLanguage(petriNetDefinition);
  const isPython = language === "python";

  // Both hooks are always called (React rules of hooks).
  // Only the active one receives init / change notifications.
  const tsClient = useLanguageClient();
  const pyrightClient = usePyrightClient(isPython);

  const client = isPython ? pyrightClient : tsClient;

  const [diagnosticsByUri, setDiagnosticsByUri] = useState<
    Map<DocumentUri, Diagnostic[]>
  >(new Map());

  // Subscribe to diagnostics pushed from the active server
  const handleDiagnostics = useCallback(
    (allParams: PublishDiagnosticsParams[]) => {
      setDiagnosticsByUri(buildDiagnosticsMap(allParams));
    },
    [],
  );

  useEffect(() => {
    client.onDiagnostics(handleDiagnostics);
  }, [client, handleDiagnostics]);

  // Clear diagnostics when switching language
  const prevLanguageRef = useRef(language);
  useEffect(() => {
    if (prevLanguageRef.current !== language) {
      prevLanguageRef.current = language;
      setDiagnosticsByUri(new Map());
    }
  }, [language]);

  // Initialize on first mount, then send incremental updates.
  // Re-initialize when the active client changes (language switch).
  const initializedClientRef = useRef<typeof client | null>(null);
  useEffect(() => {
    if (initializedClientRef.current !== client) {
      client.initialize(petriNetDefinition);
      initializedClientRef.current = client;
    } else {
      client.notifySDCPNChanged(petriNetDefinition);
    }
  }, [petriNetDefinition, client]);

  const totalDiagnosticsCount = countDiagnostics(diagnosticsByUri);

  const contextValue = useMemo(
    () => ({
      diagnosticsByUri,
      totalDiagnosticsCount,
      notifyDocumentChanged: client.notifyDocumentChanged,
      requestCompletion: client.requestCompletion,
      requestHover: client.requestHover,
      requestSignatureHelp: client.requestSignatureHelp,
    }),
    [
      diagnosticsByUri,
      totalDiagnosticsCount,
      client.notifyDocumentChanged,
      client.requestCompletion,
      client.requestHover,
      client.requestSignatureHelp,
    ],
  );

  return (
    <LanguageClientContext value={contextValue}>
      {children}
    </LanguageClientContext>
  );
};
