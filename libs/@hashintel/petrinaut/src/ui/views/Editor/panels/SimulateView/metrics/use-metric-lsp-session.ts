import { use, useEffect, useRef, useState } from "react";

import { LanguageClientContext } from "../../../../../../react/lsp/context";

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
  const initializedRef = useRef(false);

  useEffect(() => {
    const sessionData = { sessionId, code };

    if (!initializedRef.current) {
      initializeMetricSession(sessionData);
      initializedRef.current = true;
    } else {
      updateMetricSession(sessionData);
    }
  }, [code, initializeMetricSession, sessionId, updateMetricSession]);

  useEffect(() => {
    return () => {
      killMetricSession(sessionId);
    };
  }, [sessionId, killMetricSession]);

  return sessionId;
};
