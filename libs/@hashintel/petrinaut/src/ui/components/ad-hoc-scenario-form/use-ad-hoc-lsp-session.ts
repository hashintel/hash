import { use, useEffect, useRef, useState } from "react";

import { LanguageClientContext } from "../../../react/lsp/context";

import type { AdHocScenarioState } from "@hashintel/petrinaut-core";

/**
 * Runs an ad-hoc scenario LSP session for the lifetime of the calling
 * component: every value expression in the state gets a virtual TypeScript
 * document, and diagnostics arrive through the language client's
 * `diagnosticsByUri`. With the default (no-op) language client this is
 * harmless: no documents exist and no diagnostics ever arrive.
 */
export function useAdHocLspSession(state: AdHocScenarioState): string {
  const { initializeAdHocSession, updateAdHocSession, killAdHocSession } = use(
    LanguageClientContext,
  );
  // useState (not useRef/useMemo) — needed for a stable per-mount value.
  const [sessionId] = useState(() => crypto.randomUUID());
  const initializedRef = useRef(false);

  useEffect(() => {
    const params = { sessionId, state };
    if (!initializedRef.current) {
      initializeAdHocSession(params);
      initializedRef.current = true;
    } else {
      updateAdHocSession(params);
    }
  }, [initializeAdHocSession, sessionId, state, updateAdHocSession]);

  useEffect(() => {
    return () => {
      killAdHocSession(sessionId);
    };
  }, [killAdHocSession, sessionId]);

  return sessionId;
}
