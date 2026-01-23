import { use, useEffect, useState } from "react";

import { LSPContext } from "../lsp/lsp-context";
import type { SDCPNItemDiagnostic } from "../lsp/protocol";
import {
  CheckerContext,
  type CheckerResult,
  lspToCheckerDiagnostics,
} from "./checker-context";

export const CheckerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { client, isReady } = use(LSPContext);
  const [checkResult, setCheckResult] = useState<CheckerResult>({
    isValid: true,
    itemDiagnostics: [],
  });

  // Subscribe to LSP diagnostics
  useEffect(() => {
    if (!client || !isReady) {
      return;
    }

    const handleDiagnostics = (diagnostics: SDCPNItemDiagnostic[]) => {
      const checkerDiagnostics = lspToCheckerDiagnostics(diagnostics);
      setCheckResult({
        isValid: checkerDiagnostics.length === 0,
        itemDiagnostics: checkerDiagnostics,
      });
    };

    // Subscribe to diagnostic updates
    const unsubscribe = client.onDiagnostics(handleDiagnostics);

    // Request initial diagnostics
    void client.getDiagnostics([]).then(handleDiagnostics);

    return () => {
      unsubscribe();
    };
  }, [client, isReady]);

  const totalDiagnosticsCount = checkResult.itemDiagnostics.reduce(
    (sum, item) => sum + item.diagnostics.length,
    0,
  );

  return (
    <CheckerContext.Provider
      value={{
        checkResult,
        totalDiagnosticsCount,
      }}
    >
      {children}
    </CheckerContext.Provider>
  );
};
