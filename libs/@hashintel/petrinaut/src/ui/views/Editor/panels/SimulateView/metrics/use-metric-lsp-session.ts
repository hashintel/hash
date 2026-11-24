import { use } from "react";

import { LanguageClientContext } from "../../../../../../react/lsp/context";
import { useLspSession } from "../../../../../../react/lsp/use-lsp-session";

/**
 * Keeps a temporary language session for one metric's code: started on mount,
 * updated when the code changes, ended on unmount. Returns the session's id,
 * which is the given one or a new one.
 */
export const useMetricLspSession = (
  code: string,
  givenSessionId?: string,
): string => {
  const { initializeMetricSession, updateMetricSession, killMetricSession } =
    use(LanguageClientContext);

  return useLspSession(
    {
      initialize: initializeMetricSession,
      update: updateMetricSession,
      kill: killMetricSession,
    },
    { code },
    code,
    givenSessionId,
  );
};
