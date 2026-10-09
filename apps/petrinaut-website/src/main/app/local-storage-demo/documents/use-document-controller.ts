import { useCallback, useMemo } from "react";

import { useLocalDocumentRepository } from "./local-storage/use-local-document-repository";

import type { DocumentController } from "./document-repository";

export const useDocumentController = (input: {
  readonly documentId: string;
  readonly onOpenDocument: (documentId: string) => void;
}): {
  readonly controller: DocumentController;
} => {
  const { repository } = useLocalDocumentRepository({
    documentId: input.documentId,
    onOpen: input.onOpenDocument,
  });
  const createAndOpen = useCallback<DocumentController["createAndOpen"]>(
    ({ definition, title }) => {
      const created = repository.actions.create({ definition, title });
      repository.open(created.documentId);
    },
    [repository],
  );
  const controller = useMemo<DocumentController>(
    () => ({ repository, createAndOpen }),
    [createAndOpen, repository],
  );
  return { controller };
};
