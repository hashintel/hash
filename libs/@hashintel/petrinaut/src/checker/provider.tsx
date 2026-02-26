import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SDCPNContext } from "../state/sdcpn-context";
import { LanguageClientContext } from "./context";
import type {
  Diagnostic,
  DocumentUri,
  PublishDiagnosticsParams,
} from "./worker/protocol";
import { useLanguageClient } from "./worker/use-language-client";

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
      setDiagnosticsByUri(() => {
        const next = new Map<DocumentUri, Diagnostic[]>();
        for (const param of allParams) {
          if (param.diagnostics.length > 0) {
            next.set(param.uri, param.diagnostics);
          }
        }
        return next;
      });
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

  const totalDiagnosticsCount = useMemo(() => {
    let count = 0;
    for (const diagnostics of diagnosticsByUri.values()) {
      count += diagnostics.length;
    }
    return count;
  }, [diagnosticsByUri]);

  return (
    <LanguageClientContext.Provider
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
    </LanguageClientContext.Provider>
  );
};
