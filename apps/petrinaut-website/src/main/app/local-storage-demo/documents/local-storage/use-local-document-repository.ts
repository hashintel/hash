import { castDraft, produce } from "immer";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createLocalStorageNetRecord,
  emptySDCPN,
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
    lastUpdated: stored.lastUpdated,
  };
};

const createDefaultDocument = () => createLocalStorageNetRecord({
  title: "New Process",
  petriNetDefinition: emptySDCPN,
});

export const useLocalDocumentRepository = (input: {
  readonly enabled: boolean;
  readonly initialDocumentId?: string;
  readonly onOpen: (documentId: string) => void;
}): LocalDocumentRepositoryAdapter => {
  const { enabled, initialDocumentId, onOpen } = input;
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
  // Mirrors the revision each stored document sits at, keyed by
  // `documentId:incarnationId`, for `settleRevision`, which has no store
  // snapshot of its own to read. `persistRevision` advances it as it writes,
  // and the effect below re-syncs it whenever storage changes — including
  // writes made by another tab.
  const persistedRevisionsRef = useRef(new Map<string, DocumentRevisionId>());
  useEffect(() => {
    persistedRevisionsRef.current = new Map(
      Object.values(storedSDCPNs).flatMap((stored) =>
        stored.incarnationId === undefined || stored.revisionId === undefined
          ? []
          : [[`${stored.id}:${stored.incarnationId}`, stored.revisionId]],
      ),
    );
  }, [storedSDCPNs]);
  const [currentDocumentId, setCurrentDocumentId] = useState<string | null>(
    initialDocumentId ?? null,
  );
  if (enabled && storageReady && currentDocumentId === null) {
    const initialDocumentId = mostRecentDocumentId(documents);
    if (initialDocumentId !== undefined)
      setCurrentDocumentId(initialDocumentId);
  }

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

  const open = useCallback(
    (documentId: string) => {
      if (!documents[documentId]) return;
      if (documentId !== currentDocumentId) onOpen(documentId);
      setCurrentDocumentId(documentId);
    },
    [
      currentDocumentId,
      documents,
      onOpen,
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
      setStoredSDCPNs((previous) => ({ ...previous, [stored.id]: stored }));
      setCurrentDocumentId(stored.id);
      onOpen(stored.id);
      return toDocumentRecord(stored);
    },
    [onOpen, setCurrentDocumentId, setStoredSDCPNs],
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
      // Predecessor and incarnation are checked against the very store the
      // write lands in: `setStoredSDCPNs` re-reads storage when another tab
      // has written since this tab last did, so a check made outside the
      // updater could pass on a revision the store no longer holds and then
      // overwrite the other tab's work.
      const refusal: { error: Error | null } = { error: null };
      setStoredSDCPNs((previous) => {
        const stored =
          previous[change.documentId] ?? documents[change.documentId];
        if (stored === undefined) {
          refusal.error = new Error(
            `Local document ${change.documentId} is not available.`,
          );
          return previous;
        }
        // A stored entry predating incarnation tracking takes the identity
        // its record was given until the mirroring effect stamps it.
        const record = records.find(
          ({ documentId }) => documentId === change.documentId,
        );
        const storedIncarnationId =
          stored.incarnationId ?? record?.incarnationId;
        const storedRevisionId = stored.revisionId ?? record?.revisionId;
        if (storedIncarnationId !== change.incarnationId) {
          refusal.error = new Error(
            `Local document ${change.documentId} has a different incarnation.`,
          );
          return previous;
        }
        if (storedRevisionId !== change.previousRevisionId) {
          refusal.error = new Error(
            `Local document ${change.documentId} revision does not follow its predecessor.`,
          );
          return previous;
        }
        persistedRevisionsRef.current.set(
          `${change.documentId}:${change.incarnationId}`,
          change.revisionId,
        );
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
      if (refusal.error !== null) throw refusal.error;
    },
    [documents, persistedRevisionsRef, records, setStoredSDCPNs],
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
