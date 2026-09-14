import { castDraft, produce } from "immer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createLocalStorageNetRecord,
  emptySDCPN,
  isEmptySDCPN,
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "../../use-local-storage-sdcpns";

import type {
  DocumentRecord,
  DocumentRepository,
} from "../document-repository";
import type { DocumentRevisionId } from "@hashintel/petrinaut-core";

type StoredDocuments = Record<string, SDCPNInLocalStorage>;

export interface LocalDocumentRepositoryAdapter {
  readonly repository: DocumentRepository;
  readonly storedDocuments: StoredDocuments;
  readonly updateStoredDocuments: (
    update: (documents: StoredDocuments) => StoredDocuments,
  ) => void;
}

const mostRecentDocumentId = (documents: StoredDocuments): string | undefined =>
  Object.values(documents).toSorted(
    (leftDocument, rightDocument) =>
      new Date(rightDocument.lastUpdated).getTime() -
      new Date(leftDocument.lastUpdated).getTime(),
  )[0]?.id;

const toDocumentRecord = (stored: SDCPNInLocalStorage): DocumentRecord => {
  return {
    documentId: stored.id,
    incarnationId: stored.incarnationId ?? crypto.randomUUID(),
    revisionId: stored.revisionId ?? crypto.randomUUID(),
    title: stored.title,
    definition: stored.sdcpn,
    origin: { kind: "local" },
  };
};

const createDefaultDocument = (): SDCPNInLocalStorage => ({
  id: "net-1",
  title: "New Process",
  sdcpn: emptySDCPN,
  lastUpdated: new Date(0).toISOString(),
  incarnationId: crypto.randomUUID(),
  revisionId: crypto.randomUUID(),
});

export const useLocalDocumentRepository = (input: {
  readonly enabled: boolean;
  readonly onOpen: () => void;
}): LocalDocumentRepositoryAdapter => {
  const { enabled, onOpen } = input;
  const {
    ready: storageReady,
    storedSDCPNs,
    setStoredSDCPNs,
  } = useLocalStorageSDCPNs({ enabled });
  const [defaultDocument] = useState(createDefaultDocument);
  const documents = useMemo(
    () =>
      storageReady && Object.keys(storedSDCPNs).length === 0
        ? { [defaultDocument.id]: defaultDocument }
        : storedSDCPNs,
    [defaultDocument, storageReady, storedSDCPNs],
  );
  const persistedRevisionsRef = useRef(new Map<string, DocumentRevisionId>());
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(
    () => mostRecentDocumentId(documents) ?? null,
  );

  const records = useMemo(
    () => Object.values(documents).map((stored) => toDocumentRecord(stored)),
    [documents],
  );
  const current =
    records.find(({ documentId }) => documentId === currentDocumentId) ??
    records[0] ??
    null;

  useEffect(() => {
    if (!enabled || current === null) return;
    const stored = storedSDCPNs[current.documentId];
    if (
      stored?.incarnationId === current.incarnationId &&
      stored.revisionId === current.revisionId
    ) {
      return;
    }
    setStoredSDCPNs((previous) => ({
      ...previous,
      [current.documentId]: {
        ...(previous[current.documentId] ?? defaultDocument),
        incarnationId: current.incarnationId,
        revisionId: current.revisionId,
      },
    }));
  }, [current, defaultDocument, enabled, setStoredSDCPNs, storedSDCPNs]);

  const updateStoredDocuments = useCallback(
    (update: (previous: StoredDocuments) => StoredDocuments) => {
      setStoredSDCPNs(update);
    },
    [setStoredSDCPNs],
  );

  const removeEmptyCurrentDocument = useCallback(
    (nextDocumentId: string) => {
      if (
        current === null ||
        current.documentId === nextDocumentId ||
        !isEmptySDCPN(current.definition)
      ) {
        return;
      }
      setStoredSDCPNs((previous) => {
        const stored = previous[current.documentId];
        if (stored === undefined || !isEmptySDCPN(stored.sdcpn))
          return previous;
        const next = { ...previous };
        delete next[current.documentId];
        return next;
      });
    },
    [current, setStoredSDCPNs],
  );

  const open = useCallback(
    (documentId: string) => {
      if (!documents[documentId]) return;
      removeEmptyCurrentDocument(documentId);
      if (documentId !== currentDocumentId) onOpen();
      setCurrentDocumentId(documentId);
    },
    [
      currentDocumentId,
      documents,
      onOpen,
      removeEmptyCurrentDocument,
      setCurrentDocumentId,
    ],
  );

  const create = useCallback(
    ({
      definition,
      title,
    }: {
      readonly definition: DocumentRecord["definition"];
      readonly title: string;
    }): DocumentRecord => {
      const stored = createLocalStorageNetRecord({
        petriNetDefinition: definition,
        title,
      });
      removeEmptyCurrentDocument(stored.id);
      setStoredSDCPNs((previous) => ({ ...previous, [stored.id]: stored }));
      setCurrentDocumentId(stored.id);
      onOpen();
      return toDocumentRecord(stored);
    },
    [onOpen, removeEmptyCurrentDocument, setCurrentDocumentId, setStoredSDCPNs],
  );

  const rename = useCallback(
    ({
      documentId,
      title,
    }: {
      readonly documentId: string;
      readonly title: string;
    }) => {
      setStoredSDCPNs((previous) => {
        const stored = previous[documentId];
        if (stored === undefined) return previous;
        return produce(previous, (draft) => {
          const document = draft[documentId];
          if (document === undefined) return;
          document.title = title;
          document.lastUpdated = new Date().toISOString();
        });
      });
    },
    [setStoredSDCPNs],
  );

  const persistRevision: DocumentRepository["persistRevision"] = useCallback(
    async (change) => {
      const storedDocument = documents[change.documentId];
      if (storedDocument === undefined)
        throw new Error(
          `Local document ${change.documentId} is not available.`,
        );
      const document = toDocumentRecord(storedDocument);
      if (document.incarnationId !== change.incarnationId)
        throw new Error(
          `Local document ${change.documentId} has a different incarnation.`,
        );
      const identityKey = `${change.documentId}:${change.incarnationId}`;
      const persistedRevision =
        persistedRevisionsRef.current.get(identityKey) ?? document.revisionId;
      if (persistedRevision !== change.previousRevisionId)
        throw new Error(
          `Local document ${change.documentId} revision does not follow its predecessor.`,
        );
      persistedRevisionsRef.current.set(identityKey, change.revisionId);
      setStoredSDCPNs((previous) => {
        const stored = previous[change.documentId] ?? storedDocument;
        const next: SDCPNInLocalStorage = {
          ...stored,
          incarnationId: change.incarnationId,
          revisionId: change.revisionId,
          sdcpn: change.definition,
          lastUpdated: new Date().toISOString(),
        };
        return produce(previous, (draft) => {
          draft[change.documentId] = castDraft(next);
        });
      });
    },
    [documents, persistedRevisionsRef, setStoredSDCPNs],
  );

  const settleRevision: DocumentRepository["settleRevision"] = useCallback(
    async ({ documentId, revisionId }) => {
      const storedDocument = documents[documentId];
      if (storedDocument === undefined)
        throw new Error(`Local document ${documentId} is not available.`);
      const document = toDocumentRecord(storedDocument);
      const identityKey = `${documentId}:${document.incarnationId}`;
      const persistedRevision =
        persistedRevisionsRef.current.get(identityKey) ?? document.revisionId;
      if (persistedRevision !== revisionId)
        throw new Error(
          `Local document ${documentId} has not persisted revision ${revisionId}.`,
        );
    },
    [documents],
  );

  const repository = useMemo<DocumentRepository>(
    () => ({
      records,
      current,
      status: storageReady ? { state: "ready" } : { state: "loading" },
      open,
      actions: { create, rename },
      persistRevision,
      settleRevision,
    }),
    [
      create,
      current,
      open,
      persistRevision,
      records,
      rename,
      settleRevision,
      storageReady,
    ],
  );

  return { repository, storedDocuments: storedSDCPNs, updateStoredDocuments };
};
