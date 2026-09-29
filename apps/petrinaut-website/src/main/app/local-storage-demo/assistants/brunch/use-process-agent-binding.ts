import { useEffect, useMemo, useState } from "react";

import { getOrCreateBrunchConversationId } from "../../brunch-conversation-id";

import type { DocumentRecord } from "../../documents/document-repository";

export interface ProcessAgentBinding {
  readonly conversationId: string;
  readonly documentId: string;
  readonly incarnationId: string;
}

export interface FixtureProcessAgentConfiguration {
  readonly conversationId: string;
}

export const resolveProcessAgentBinding = (input: {
  readonly document: DocumentRecord | null;
  readonly fixture: FixtureProcessAgentConfiguration | undefined;
  readonly fallbackConversationId?: string;
}): ProcessAgentBinding | null => {
  if (input.document === null) return null;
  const conversationId =
    input.fixture?.conversationId ?? input.fallbackConversationId;
  if (conversationId === undefined) return null;
  return {
    conversationId,
    documentId: input.document.documentId,
    incarnationId: input.document.incarnationId,
  };
};

export const useProcessAgentBinding = (input: {
  readonly document: DocumentRecord | null;
  readonly fixture: FixtureProcessAgentConfiguration | undefined;
}): ProcessAgentBinding | null => {
  const documentId = input.document?.documentId;
  const incarnationId = input.document?.incarnationId;
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
    if (documentId === undefined || incarnationId === undefined) return null;
    const conversationId = fixtureConversationId ?? fallbackConversationId;
    return conversationId === undefined
      ? null
      : { conversationId, documentId, incarnationId };
  }, [
    documentId,
    fallbackConversationId,
    fixtureConversationId,
    incarnationId,
  ]);
};
