import { useEffect, useMemo, useState } from "react";

import { getOrCreateBrunchConversationId } from "./brunch-conversation-id";

import type { DocumentRecord } from "../../../local-storage-demo/documents/document-repository";

export interface ProcessAgentBinding {
  readonly conversationId: string;
  readonly documentId: string;
  /**
   * The net id again. Brunch servers deployed before conversations were
   * scoped by net id reject a binding without it.
   */
  readonly incarnationId?: string;
}

export interface FixtureProcessAgentConfiguration {
  readonly conversationId: string;
}

export const useProcessAgentBinding = (input: {
  readonly document: DocumentRecord | null;
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
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- browser persistence is read only after this binding commits
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
