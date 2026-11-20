import { use, useState } from "react";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { useLspSession } from "../shared/use-lsp-session";

/**
 * Keeps a temporary language session for one metric's code: started on mount,
 * updated when the code changes, ended on unmount. Returns the session's id,
 * which is the given one or a new one.
 */
export const useMetricLspSession = (
  code: string,
  providedSessionId?: string,
): string => {
  const { initializeMetricSession, updateMetricSession, killMetricSession } =
    use(LanguageClientContext);
  const [sessionId] = useState(() => providedSessionId ?? crypto.randomUUID());

  useLspSession(
    {
      initialize: initializeMetricSession,
      update: updateMetricSession,
      kill: killMetricSession,
    },
    { sessionId, code },
    code,
  );

  return sessionId;
};
