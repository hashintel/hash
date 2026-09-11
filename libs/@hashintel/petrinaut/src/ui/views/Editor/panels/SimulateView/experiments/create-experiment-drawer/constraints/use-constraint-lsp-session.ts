import { use, useEffect, useRef } from "react";

import { LanguageClientContext } from "../../../../../../../../react/lsp/context";

import type { ConstraintSessionParams } from "@hashintel/petrinaut-core/workers/lsp";

/**
 * Runs a constraint LSP session for the lifetime of the calling component:
 * the constraint's source becomes a virtual TypeScript document named by
 * `getConstraintDocumentUri(params.sessionId)`, and its diagnostics arrive
 * through the language client's `diagnosticsByUri`. With the default (no-op)
 * language client no document exists and no diagnostics ever arrive.
 */
export const useConstraintLspSession = (params: ConstraintSessionParams) => {
  const {
    initializeConstraintSession,
    updateConstraintSession,
    killConstraintSession,
  } = use(LanguageClientContext);
  const { sessionId, space, code, scenarioParameters } = params;
  const initializedRef = useRef(false);

  useEffect(() => {
    const sessionParams = { sessionId, space, code, scenarioParameters };
    if (!initializedRef.current) {
      initializeConstraintSession(sessionParams);
      initializedRef.current = true;
    } else {
      updateConstraintSession(sessionParams);
    }
  }, [
    code,
    initializeConstraintSession,
    scenarioParameters,
    sessionId,
    space,
    updateConstraintSession,
  ]);

  useEffect(() => {
    return () => {
      killConstraintSession(sessionId);
    };
  }, [killConstraintSession, sessionId]);
};
