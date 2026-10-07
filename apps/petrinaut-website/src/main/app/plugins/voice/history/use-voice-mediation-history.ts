import { useMemo, useState } from "react";

import { VoiceMediationHistory } from "./voice-mediation-history";

/**
 * One history per conversation while the plugin stays mounted. A Live turn
 * keeps the history it began in, so switching away and back must return that
 * same instance rather than a fresh one that has never seen the turn. The
 * editor remounts its plugins for a new core instance, and the new histories
 * reload their submitted turns from local storage.
 */
export const useVoiceMediationHistory = (
  conversationId: string | null,
): VoiceMediationHistory | undefined => {
  const [histories] = useState(() => new Map<string, VoiceMediationHistory>());
  return useMemo(() => {
    if (conversationId === null) return undefined;
    const existing = histories.get(conversationId);
    if (existing) return existing;
    const created = new VoiceMediationHistory(conversationId, {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    });
    histories.set(conversationId, created);
    return created;
  }, [conversationId, histories]);
};
