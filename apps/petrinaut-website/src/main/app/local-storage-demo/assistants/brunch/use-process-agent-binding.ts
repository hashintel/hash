import { useEffect, useMemo, useState } from "react";

import { getOrCreateBrunchConversationId } from "../../brunch-conversation-id";

import type {
  DocumentRecord,
  ProcessAgentSeed,
} from "../../documents/document-repository";

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
  readonly seed: ProcessAgentSeed | undefined;
  readonly fixture: FixtureProcessAgentConfiguration | undefined;
  readonly fallbackConversationId?: string;
}): ProcessAgentBinding | null => {
  if (input.document === null) return null;
  if (
    input.seed !== undefined &&
    input.seed.documentId !== input.document.documentId
  ) {
    throw new Error(
      `Process-agent seed belongs to ${input.seed.documentId}, not ${input.document.documentId}.`,
    );
  }
  const conversationId =
    input.seed?.conversationId ??
    input.fixture?.conversationId ??
    input.fallbackConversationId;
  if (conversationId === undefined) return null;
  return {
    conversationId,
    documentId: input.document.documentId,
    incarnationId: input.document.incarnationId,
  };
};

export const useProcessAgentBinding = (input: {
  readonly document: DocumentRecord | null;
  readonly seed: ProcessAgentSeed | undefined;
  readonly fixture: FixtureProcessAgentConfiguration | undefined;
}): ProcessAgentBinding | null => {
  const documentId = input.document?.documentId;
  const incarnationId = input.document?.incarnationId;
  const seedDocumentId = input.seed?.documentId;
  const seedConversationId = input.seed?.conversationId;
  const fixtureConversationId = input.fixture?.conversationId;
  const [fallbackConversationIds, setFallbackConversationIds] = useState<
    Readonly<Record<string, string>>
  >({});

  useEffect(() => {
    if (
      documentId === undefined ||
      seedConversationId !== undefined ||
      fixtureConversationId !== undefined
    ) {
      return;
    }
    const conversationId = getOrCreateBrunchConversationId(documentId);
    // eslint-disable-next-line react-hooks-js/set-state-in-effect -- browser persistence is read only after this binding commits
    setFallbackConversationIds((current) =>
      current[documentId] === conversationId
        ? current
        : { ...current, [documentId]: conversationId },
    );
  }, [documentId, fixtureConversationId, seedConversationId]);

  const fallbackConversationId =
    documentId === undefined ? undefined : fallbackConversationIds[documentId];
  return useMemo(() => {
    if (documentId === undefined || incarnationId === undefined) return null;
    if (seedDocumentId !== undefined && seedDocumentId !== documentId) {
      throw new Error(
        `Process-agent seed belongs to ${seedDocumentId}, not ${documentId}.`,
      );
    }
    const conversationId =
      seedConversationId ?? fixtureConversationId ?? fallbackConversationId;
    return conversationId === undefined
      ? null
      : { conversationId, documentId, incarnationId };
  }, [
    documentId,
    fallbackConversationId,
    fixtureConversationId,
    incarnationId,
    seedConversationId,
    seedDocumentId,
  ]);
};
