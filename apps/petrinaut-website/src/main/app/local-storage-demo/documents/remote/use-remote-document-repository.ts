import { useCallback, useMemo } from "react";

import { useWorkedModelCopy } from "./use-worked-model-copy";

import type {
  DocumentRecord,
  DocumentRepository,
  DocumentSource,
} from "../document-repository";

const unavailableEndpointError = new Error(
  "This worked-model document requires a configured Brunch endpoint.",
);

export const useRemoteDocumentRepository = (input: {
  readonly bundleKey: string | undefined;
  readonly chatEndpoint: string;
  readonly currentOrigin: string;
  readonly enabled: boolean;
  readonly isBrunchConfigured: boolean;
  readonly principalKey: string;
}): DocumentSource => {
  const workedModel = useWorkedModelCopy({
    bundleKey: input.bundleKey,
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    enabled: input.enabled && input.isBrunchConfigured,
    principalKey: input.principalKey,
  });

  const current = useMemo<DocumentRecord | null>(
    () =>
      workedModel.copy === null
        ? null
        : {
            documentId: workedModel.copy.documentId,
            incarnationId: workedModel.copy.incarnationId,
            revisionId: workedModel.copy.revisionId,
            title: workedModel.copy.title,
            definition: workedModel.copy.definition,
            origin: {
              kind: "template",
              bundleKey: workedModel.copy.bundleKey,
              fixtureVersion: workedModel.copy.fixtureVersion,
            },
          },
    [workedModel.copy],
  );

  const requireCurrent = useCallback(
    (documentId: string): DocumentRecord => {
      if (current === null)
        throw new Error("Worked-model copy is not available.");
      if (current.documentId !== documentId)
        throw new Error(
          `Worked-model repository does not own document ${documentId}.`,
        );
      return current;
    },
    [current],
  );

  const persistRevision: DocumentRepository["persistRevision"] = useCallback(
    async (change) => {
      const document = requireCurrent(change.documentId);
      if (document.incarnationId !== change.incarnationId)
        throw new Error(
          `Worked-model document ${change.documentId} has a different incarnation.`,
        );
      await workedModel.persistDefinition(change);
    },
    [requireCurrent, workedModel],
  );

  const settleRevision: DocumentRepository["settleRevision"] = useCallback(
    async ({ documentId, revisionId }) => {
      requireCurrent(documentId);
      await workedModel.settleDocumentRevision(revisionId);
    },
    [requireCurrent, workedModel],
  );

  const repository = useMemo<DocumentRepository>(() => {
    const status: DocumentRepository["status"] = !input.enabled
      ? { state: "ready" }
      : !input.isBrunchConfigured
        ? { state: "unavailable", error: unavailableEndpointError }
        : workedModel.error !== null
          ? { state: "unavailable", error: workedModel.error }
          : workedModel.loading || current === null
            ? { state: "loading" }
            : { state: "ready" };

    return {
      records: current === null ? [] : [current],
      current,
      status,
      open: (documentId) => {
        requireCurrent(documentId);
      },
      actions:
        input.enabled && input.isBrunchConfigured
          ? { createCleanCopy: workedModel.createCleanCopy }
          : {},
      persistRevision,
      settleRevision,
    };
  }, [
    current,
    input.enabled,
    input.isBrunchConfigured,
    persistRevision,
    requireCurrent,
    settleRevision,
    workedModel.createCleanCopy,
    workedModel.error,
    workedModel.loading,
  ]);

  return useMemo(
    () => ({
      repository,
      ...(current === null
        ? {}
        : {
            processAgentSeed: {
              documentId: current.documentId,
              conversationId: workedModel.copy!.conversationId,
            },
          }),
    }),
    [current, repository, workedModel.copy],
  );
};
