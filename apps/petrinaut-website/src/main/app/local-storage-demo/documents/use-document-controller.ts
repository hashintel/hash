import { useCallback, useMemo } from "react";

import { useLocalDocumentRepository } from "./local-storage/use-local-document-repository";
import { useRemoteDocumentRepository } from "./remote/use-remote-document-repository";

import type { DocumentController, DocumentSource } from "./document-repository";

export const useDocumentController = (input: {
  readonly bundleKey: string | undefined;
  readonly chatEndpoint: string;
  readonly currentOrigin: string;
  readonly isBrunchConfigured: boolean;
  readonly principalKey: string;
  readonly remoteRouteSelected: boolean;
  readonly onOpenDocument: () => void;
  readonly onSelectLocalRoute: () => void;
}): {
  readonly controller: DocumentController;
} => {
  const { onSelectLocalRoute } = input;
  const local = useLocalDocumentRepository({
    enabled: !input.remoteRouteSelected,
    onOpen: input.onOpenDocument,
  });
  const remote = useRemoteDocumentRepository({
    bundleKey: input.bundleKey,
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    enabled: input.remoteRouteSelected,
    isBrunchConfigured: input.isBrunchConfigured,
    principalKey: input.principalKey,
  });
  const source = useMemo<DocumentSource>(
    () => (input.remoteRouteSelected ? remote : local),
    [input.remoteRouteSelected, local, remote],
  );
  const createLocalAndOpen = useCallback<
    DocumentController["createLocalAndOpen"]
  >(
    ({ definition, title }) => {
      const create = local.repository.actions.create;
      if (create === undefined)
        throw new Error(
          "The local document repository cannot create documents.",
        );
      const created = create({ definition, title });
      onSelectLocalRoute();
      local.repository.open(created.documentId);
    },
    [local.repository, onSelectLocalRoute],
  );
  const controller = useMemo<DocumentController>(
    () => ({ source, createLocalAndOpen }),
    [createLocalAndOpen, source],
  );
  return { controller };
};
