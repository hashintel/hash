import { useSyncExternalStore } from "react";

import { localStorageKeys } from "../../../../../../../lib/config";
import { useAuthenticatedUser } from "../../../../../../shared/auth-info-context";
import { findAddableAction } from "./step-display";

import type { AddableAction } from "./step-display";

const maxRecentActions = 3;

const parseStoredIds = (stored: string | null): string[] => {
  try {
    const parsed: unknown = JSON.parse(stored ?? "[]");

    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
};

/** The stored actions that can still be added, newest first. Anything else in storage is ignored. */
export const getRecentActions = (stored: string | null): AddableAction[] =>
  parseStoredIds(stored)
    .flatMap(
      (actionDefinitionId) => findAddableAction(actionDefinitionId) ?? [],
    )
    .slice(0, maxRecentActions);

/** What to store once `actionDefinitionId` is added: it, then the others most recent first. */
export const addRecentAction = (
  stored: string | null,
  actionDefinitionId: string,
): string =>
  JSON.stringify(
    [
      actionDefinitionId,
      ...getRecentActions(stored)
        .map((action) => action.actionDefinitionId)
        .filter((recentId) => recentId !== actionDefinitionId),
    ].slice(0, maxRecentActions),
  );

const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
};

/** The actions the signed-in user added most recently, in any flow, kept in this browser. */
export const useRecentActions = () => {
  const { authenticatedUser } = useAuthenticatedUser();
  const key = `${localStorageKeys.recentFlowActions}:${authenticatedUser.accountId}`;
  const stored = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(key),
    () => null,
  );

  return {
    recentActions: getRecentActions(stored),
    /** Best effort: a full or blocked storage loses the record, not the step being added. */
    recordAddedAction: (actionDefinitionId: string) => {
      try {
        localStorage.setItem(
          key,
          addRecentAction(localStorage.getItem(key), actionDefinitionId),
        );
      } catch {
        return;
      }

      for (const listener of listeners) {
        listener();
      }
    },
  };
};
