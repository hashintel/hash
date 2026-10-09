import { castDraft, produce } from "immer";
import { useCallback, useMemo } from "react";

import {
  createLocalStorageNetRecord,
  type SDCPNInLocalStorage,
  useLocalStorageSDCPNs,
} from "../../use-local-storage-sdcpns";

import type {
  DocumentRecord,
  DocumentRepository,
} from "../document-repository";

type StoredDocuments = Record<string, SDCPNInLocalStorage>;

export interface LocalDocumentRepositoryAdapter {
  readonly repository: DocumentRepository;
  readonly storedDocuments: StoredDocuments;
  readonly updateStoredDocuments: (
    update: (documents: StoredDocuments) => StoredDocuments,
  ) => void;
}

const toDocumentRecord = (stored: SDCPNInLocalStorage): DocumentRecord => {
  return {
    documentId: stored.id,
    revisionId: stored.revisionId ?? crypto.randomUUID(),
    title: stored.title,
    definition: stored.sdcpn,
    lastUpdated: stored.lastUpdated,
  };
};

export const useLocalDocumentRepository = (input: {
  /** The open document. The host owns the choice, usually through the URL. */
  readonly documentId: string;
  /** Asks the host to open another document, by passing it back as `documentId`. */
  readonly onOpen: (documentId: string) => void;
}): LocalDocumentRepositoryAdapter => {
  const { documentId: currentDocumentId, onOpen } = input;
  const {
    ready: storageReady,
    storedSDCPNs,
    setStoredSDCPNs,
  } = useLocalStorageSDCPNs();

  const records = useMemo(
    () => Object.values(storedSDCPNs).map((stored) => toDocumentRecord(stored)),
    [storedSDCPNs],
  );
  const current =
    records.find(({ documentId }) => documentId === currentDocumentId) ?? null;

  const updateStoredDocuments = useCallback(
    (update: (previous: StoredDocuments) => StoredDocuments) => {
      setStoredSDCPNs(update);
    },
    [setStoredSDCPNs],
  );

  const open = useCallback(
    (documentId: string) => {
      if (documentId !== currentDocumentId) onOpen(documentId);
    },
    [currentDocumentId, onOpen],
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
      return toDocumentRecord(stored);
    },
    [setStoredSDCPNs],
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
      // The predecessor is checked against the very store the
      // write lands in: `setStoredSDCPNs` re-reads storage when another tab
      // has written since this tab last did, so a check made outside the
      // updater could pass on a revision the store no longer holds and then
      // overwrite the other tab's work.
      const refusal: { error: Error | null } = { error: null };
      setStoredSDCPNs((previous) => {
        const stored = previous[change.documentId];
        if (stored === undefined) {
          refusal.error = new Error(
            `Local document ${change.documentId} is not available.`,
          );
          return previous;
        }
        // A stored entry without a revision takes the one its record was
        // given.
        const record = records.find(
          ({ documentId }) => documentId === change.documentId,
        );
        const storedRevisionId = stored.revisionId ?? record?.revisionId;
        if (storedRevisionId !== change.previousRevisionId) {
          refusal.error = new Error(
            `Local document ${change.documentId} revision does not follow its predecessor.`,
          );
          return previous;
        }
        const next: SDCPNInLocalStorage = {
          ...stored,
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
    [records, setStoredSDCPNs],
  );

  const repository = useMemo<DocumentRepository>(
    () => ({
      records,
      current,
      status: storageReady ? { state: "ready" } : { state: "loading" },
      open,
      actions: { create, rename },
      persistRevision,
    }),
    [create, current, open, persistRevision, records, rename, storageReady],
  );

  return { repository, storedDocuments: storedSDCPNs, updateStoredDocuments };
};
