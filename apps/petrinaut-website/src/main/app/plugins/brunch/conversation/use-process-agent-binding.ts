import { useEffect, useMemo, useState } from "react";

import { getOrCreateBrunchConversationId } from "./brunch-conversation-id";

import type { BrowserContext } from "@hashintel/brunch-agent";

export type ProcessAgentBinding = BrowserContext["binding"];

export interface FixtureProcessAgentConfiguration {
  readonly conversationId: string;
}

export const useProcessAgentBinding = (input: {
  readonly document: { readonly documentId: string } | null;
  readonly fixture: FixtureProcessAgentConfiguration | undefined;
}): ProcessAgentBinding | null => {
  const documentId = input.document?.documentId;
  const fixtureConversationId = input.fixture?.conversationId;
  const [fallbackConversationIds, setFallbackConversationIds] = useState<
    Readonly<Record<string, string>>
  >({});

  useEffect(() => {
    if (documentId === undefined || fixtureConversationId !== undefined) {
      return;
    }
    const conversationId = getOrCreateBrunchConversationId(documentId);
    // eslint-disable-next-line react/set-state-in-effect -- browser persistence is read only after this binding commits
    setFallbackConversationIds((current) =>
      current[documentId] === conversationId
        ? current
        : { ...current, [documentId]: conversationId },
    );
  }, [documentId, fixtureConversationId]);

  const fallbackConversationId =
    documentId === undefined ? undefined : fallbackConversationIds[documentId];
  return useMemo(() => {
    if (documentId === undefined) return null;
    const conversationId = fixtureConversationId ?? fallbackConversationId;
    return conversationId === undefined
      ? null
      : { conversationId, documentId, incarnationId: documentId };
  }, [documentId, fallbackConversationId, fixtureConversationId]);
};
