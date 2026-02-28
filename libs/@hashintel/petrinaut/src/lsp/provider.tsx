import { use, useCallback, useEffect, useRef, useState } from "react";

import { SDCPNContext } from "../state/sdcpn-context";
import { LanguageClientContext } from "./context";
import type {
  Diagnostic,
  DocumentUri,
  PublishDiagnosticsParams,
} from "./worker/protocol";
import { useLanguageClient } from "./worker/use-language-client";

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
  const client = useLanguageClient();

  const [diagnosticsByUri, setDiagnosticsByUri] = useState<
    Map<DocumentUri, Diagnostic[]>
  >(new Map());

  // Subscribe to diagnostics pushed from the server
  const handleDiagnostics = useCallback(
    (allParams: PublishDiagnosticsParams[]) => {
      setDiagnosticsByUri(buildDiagnosticsMap(allParams));
    },
    [],
  );

  useEffect(() => {
    client.onDiagnostics(handleDiagnostics);
  }, [client, handleDiagnostics]);

  // Initialize on first mount, then send incremental updates
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!initializedRef.current) {
      client.initialize(petriNetDefinition);
      initializedRef.current = true;
    } else {
      client.notifySDCPNChanged(petriNetDefinition);
    }
  }, [petriNetDefinition, client]);

  const totalDiagnosticsCount = countDiagnostics(diagnosticsByUri);

  return (
    <LanguageClientContext
      value={{
        diagnosticsByUri,
        totalDiagnosticsCount,
        notifyDocumentChanged: client.notifyDocumentChanged,
        requestCompletion: client.requestCompletion,
        requestHover: client.requestHover,
        requestSignatureHelp: client.requestSignatureHelp,
      }}
    >
      {children}
    </LanguageClientContext>
  );
};
