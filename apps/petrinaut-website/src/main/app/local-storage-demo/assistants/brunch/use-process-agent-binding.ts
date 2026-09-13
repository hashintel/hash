import { useMemo } from "react";

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
  return {
    conversationId:
      input.seed?.conversationId ??
      input.fixture?.conversationId ??
      getOrCreateBrunchConversationId(input.document.documentId),
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

  return useMemo(() => {
    if (documentId === undefined || incarnationId === undefined) return null;
    if (seedDocumentId !== undefined && seedDocumentId !== documentId) {
      throw new Error(
        `Process-agent seed belongs to ${seedDocumentId}, not ${documentId}.`,
      );
    }
    return {
      conversationId:
        seedConversationId ??
        fixtureConversationId ??
        getOrCreateBrunchConversationId(documentId),
      documentId,
      incarnationId,
    };
  }, [
    documentId,
    fixtureConversationId,
    incarnationId,
    seedConversationId,
    seedDocumentId,
  ]);
};
