import { useCallback, useMemo } from "react";

import { useLocalDocumentRepository } from "./local-storage/use-local-document-repository";

import type { DocumentController } from "./document-repository";

export const useDocumentController = (input: {
  readonly onOpenDocument: () => void;
}): {
  readonly controller: DocumentController;
} => {
  const { repository } = useLocalDocumentRepository({
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
