import { useEffect, useState } from "react";

import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";

import type { InstanceEngine } from "../instance-engine";
import type {
  DocumentRecord,
  DocumentRepository,
  RecordRevisionId,
} from "./document-repository";
import type { Petrinaut, PetrinautDocHandle } from "@hashintel/petrinaut-core";

interface LoadRequest {
  document: DocumentRecord;
  engine: InstanceEngine;
  acceptedRevisionIds: Set<RecordRevisionId>;
  pendingWrites: Promise<void>[];
  failedHandle: PetrinautDocHandle | undefined;
}

type ActiveHandle = {
  handle: PetrinautDocHandle;
  instance: Petrinaut;
  document: DocumentRecord;
  engine: InstanceEngine;
  request: LoadRequest;
  emittedRevisionIds: Set<RecordRevisionId>;
  latestRevisionId: { current: RecordRevisionId };
  pendingWrites: Set<Promise<void>>;
};

type PersistFailure = {
  handle: PetrinautDocHandle;
  documentId: string;
  error: Error;
};

let rustModule:
  | Promise<typeof import("@hashintel/petrinaut-core/rust")>
  | undefined;
const loadRustModule = () => {
  rustModule ??= import("@hashintel/petrinaut-core/rust").catch(
    (error: unknown) => {
      rustModule = undefined;
      throw error;
    },
  );
  return rustModule;
};

const createInstance = async (request: LoadRequest): Promise<Petrinaut> => {
  await Promise.all(request.pendingWrites);
  const options = {
    id: request.document.documentId,
    initial: request.document.definition,
    capabilities: { disabledExtensions: [] },
  };
  if (request.engine === "rust") {
    const { createRustPetrinaut } = await loadRustModule();
    return createRustPetrinaut(options);
  }
  return createPetrinaut({ document: createJsonDocHandle(options) });
};

/** Owns the selected document instance; both engines persist through the same repository. */
export const useActiveHandle = (
  repository: DocumentRepository,
  engine: InstanceEngine | null,
): {
  activeHandle: ActiveHandle | null;
  unsavedChangeMessage: string | null;
  loadError: string | null;
  retry: () => void;
} => {
  const currentDocument = repository.current;
  const [storedHandle, setStoredHandle] = useState<ActiveHandle | null>(null);
  const [request, setRequest] = useState<LoadRequest | null>(null);
  const [loadFailure, setLoadFailure] = useState<{
    request: LoadRequest;
    error: Error;
  } | null>(null);
  const [persistFailure, setPersistFailure] = useState<PersistFailure | null>(
    null,
  );
  if (
    persistFailure !== null &&
    persistFailure.documentId !== currentDocument?.documentId
  ) {
    setPersistFailure(null);
  }
  const currentHandle = storedHandle?.request === request ? storedHandle : null;
  const ownsRevision =
    currentDocument !== null &&
    currentHandle !== null &&
    currentHandle.document.documentId === currentDocument.documentId &&
    currentHandle.emittedRevisionIds.has(currentDocument.revisionId) &&
    persistFailure?.handle !== currentHandle.handle;
  const activeHandle =
    ownsRevision && currentHandle.engine === engine ? currentHandle : null;
  const requestOwnsRevision =
    request !== null &&
    currentDocument !== null &&
    request.document.documentId === currentDocument.documentId &&
    request.acceptedRevisionIds.has(currentDocument.revisionId) &&
    request.failedHandle === persistFailure?.handle;
  const requestMatches = requestOwnsRevision && request.engine === engine;

  if (currentDocument === null || engine === null) {
    if (request !== null) setRequest(null);
  } else if (activeHandle === null && !requestMatches) {
    // Capture the live snapshot before the previous effect releases its instance.
    const source = ownsRevision ? currentHandle : null;
    const pendingRequest = requestOwnsRevision ? request : null;
    setRequest({
      engine,
      document:
        source === null
          ? (pendingRequest?.document ?? currentDocument)
          : {
              ...currentDocument,
              definition: source.handle.doc() ?? currentDocument.definition,
              revisionId: source.latestRevisionId.current,
            },
      acceptedRevisionIds:
        source?.emittedRevisionIds ??
        pendingRequest?.acceptedRevisionIds ??
        new Set([currentDocument.revisionId]),
      pendingWrites:
        source === null
          ? (pendingRequest?.pendingWrites ?? [])
          : [...source.pendingWrites],
      failedHandle: persistFailure?.handle,
    });
  }

  useEffect(() => {
    if (request === null) return;
    let cancelled = false;
    let instance: Petrinaut | undefined;
    void createInstance(request).then(
      (created) => {
        if (cancelled) {
          created.dispose();
          return;
        }
        instance = created;
        setStoredHandle({
          handle: created.handle,
          instance: created,
          engine: request.engine,
          document: request.document,
          request,
          emittedRevisionIds: request.acceptedRevisionIds,
          latestRevisionId: { current: request.document.revisionId },
          pendingWrites: new Set(),
        });
      },
      (error: unknown) => {
        if (!cancelled)
          setLoadFailure({
            request,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      },
    );
    return () => {
      cancelled = true;
      instance?.dispose();
    };
  }, [request]);

  useEffect(() => {
    if (!activeHandle) return;
    const {
      document,
      emittedRevisionIds,
      handle,
      latestRevisionId,
      pendingWrites,
    } = activeHandle;
    return handle.subscribe((event) => {
      const previousRevisionId = latestRevisionId.current;
      const revisionId = crypto.randomUUID();
      latestRevisionId.current = revisionId;
      emittedRevisionIds.add(revisionId);
      const pending = repository.persistRevision({
        documentId: document.documentId,
        definition: event.next,
        previousRevisionId,
        revisionId,
      });
      pendingWrites.add(pending);
      void pending.then(
        () => {
          pendingWrites.delete(pending);
          setPersistFailure((failure) =>
            failure?.documentId === document.documentId ? null : failure,
          );
        },
        (error: unknown) => {
          pendingWrites.delete(pending);
          setPersistFailure({
            handle,
            documentId: document.documentId,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        },
      );
    });
  }, [activeHandle, repository]);

  return {
    activeHandle,
    unsavedChangeMessage:
      persistFailure?.documentId === currentDocument?.documentId
        ? (persistFailure?.error.message ?? null)
        : null,
    loadError:
      loadFailure?.request === request ? loadFailure.error.message : null,
    retry: () => setRequest(null),
  };
};
