import { useCallback, useMemo } from "react";

import { useFixtureDocumentOverlay } from "./local-storage/use-fixture-document-overlay";
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
  readonly initialLocalDocumentId?: string;
  readonly onOpenDocument: (documentId: string) => void;
  readonly onSelectLocalRoute: () => void;
  readonly fixture: {
    readonly enabled: boolean;
    readonly crewReservationSelected: boolean;
    readonly rootArcTracerSelected: boolean;
    readonly constructionSelected: boolean;
    readonly rootCreationSelected: boolean;
  };
}): {
  readonly controller: DocumentController;
} => {
  const { onSelectLocalRoute } = input;
  const local = useLocalDocumentRepository({
    enabled: !input.remoteRouteSelected,
    initialDocumentId: input.initialLocalDocumentId,
    onOpen: input.onOpenDocument,
  });
  const localOverlay = useFixtureDocumentOverlay(local, input.fixture);
  const remote = useRemoteDocumentRepository({
    bundleKey: input.bundleKey,
    chatEndpoint: input.chatEndpoint,
    currentOrigin: input.currentOrigin,
    enabled: input.remoteRouteSelected,
    isBrunchConfigured: input.isBrunchConfigured,
    principalKey: input.principalKey,
  });
  const source = useMemo<DocumentSource>(
    () => (input.remoteRouteSelected ? remote : localOverlay),
    [input.remoteRouteSelected, localOverlay, remote],
  );
  const createLocalAndOpen = useCallback<
    DocumentController["createLocalAndOpen"]
  >(
    ({ definition, title }) => {
      const create = localOverlay.repository.actions.create;
      if (create === undefined)
        throw new Error(
          "The local document repository cannot create documents.",
        );
      const created = create({ definition, title });
      onSelectLocalRoute();
      localOverlay.repository.open(created.documentId);
    },
    [localOverlay.repository, onSelectLocalRoute],
  );
  const controller = useMemo<DocumentController>(
    () => ({ source, createLocalAndOpen }),
    [createLocalAndOpen, source],
  );
  return { controller };
};
