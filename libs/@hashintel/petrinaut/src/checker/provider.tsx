import { use, useEffect, useState } from "react";

import { SDCPNContext } from "../state/sdcpn-context";
import { CheckerContext } from "./context";
import type { CheckerResult } from "./worker/protocol";
import { useCheckerWorker } from "./worker/use-checker-worker";

const EMPTY_RESULT: CheckerResult = {
  isValid: true,
  itemDiagnostics: [],
};

export const CheckerProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { petriNetDefinition } = use(SDCPNContext);
  const { setSDCPN, getCompletions, getQuickInfo, getSignatureHelp } =
    useCheckerWorker();

  const [checkResult, setCheckerResult] = useState<CheckerResult>(EMPTY_RESULT);

  useEffect(() => {
    let cancelled = false;

    void setSDCPN(petriNetDefinition).then((result) => {
      if (!cancelled) {
        setCheckerResult(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [petriNetDefinition, setSDCPN]);

  const totalDiagnosticsCount = checkResult.itemDiagnostics.reduce(
    (sum, item) => sum + item.diagnostics.length,
    0,
  );

  return (
    <CheckerContext.Provider
      value={{
        checkResult,
        totalDiagnosticsCount,
        getCompletions,
        getQuickInfo,
        getSignatureHelp,
      }}
    >
      {children}
    </CheckerContext.Provider>
  );
};
