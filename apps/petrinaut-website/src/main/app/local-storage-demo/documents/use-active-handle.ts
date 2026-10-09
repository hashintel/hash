import { useEffect, useState } from "react";

import {
  createJsonDocHandle,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
} from "@hashintel/petrinaut-core";

import type {
  DocumentRecord,
  DocumentRepository,
  RecordRevisionId,
} from "./document-repository";

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

type ActiveHandle = {
  handle: PetrinautDocHandle;
  document: DocumentRecord;
  /**
   * Every record revision minted for this handle's changes (plus the one it
   * opened at). A repository revision outside this set was written by someone
   * else — another tab, typically — and the handle must be recreated from it
   * rather than keep chaining edits from a predecessor the repository no
   * longer holds.
   */
  emittedRevisionIds: Set<RecordRevisionId>;
  /** Predecessor named by this handle's next write; kept on the handle because the persistence effect re-subscribes. */
  latestRevisionId: { current: RecordRevisionId };
};

type PersistFailure = {
  /** The handle whose change was refused; it is replaced, not kept. */
  handle: PetrinautDocHandle;
  documentId: DocumentRecord["documentId"];
  error: Error;
};

const createActiveHandle = (document: DocumentRecord): ActiveHandle => ({
  handle: createJsonDocHandle({
    id: document.documentId,
    initial: document.definition,
    capabilities: DEMO_CAPABILITIES,
  }),
  document,
  emittedRevisionIds: new Set([document.revisionId]),
  latestRevisionId: { current: document.revisionId },
});

/**
 * The live, editable handle of the open document, and the message to show
 * when the repository refused to save its last change.
 */
export const useActiveHandle = (
  repository: DocumentRepository,
): {
  activeHandle: ActiveHandle | null;
  unsavedChangeMessage: string | null;
} => {
  const currentDocument = repository.current;
  const [storedHandle, setStoredHandle] = useState<ActiveHandle | null>(null);
  // The most recent change the repository refused to persist, if any. It is
  // about the open document: cleared once a later change to that document
  // lands, or when another document is opened in its place.
  const [persistFailure, setPersistFailure] = useState<PersistFailure | null>(
    null,
  );

  // The handle follows the repository: it is recreated from the repository's
  // record whenever the two diverge — another document is open, the record
  // shows a revision not minted for this handle's changes (another tab wrote
  // it), or the repository refused one of this handle's changes, after which
  // every further change from it would be refused too, because each names the
  // rejected revision as predecessor. It is decided during render, not in an
  // effect, so no render pairs the open document with another document's
  // handle.
  const activeHandle =
    currentDocument === null
      ? null
      : storedHandle?.document.documentId === currentDocument.documentId &&
          storedHandle.emittedRevisionIds.has(currentDocument.revisionId) &&
          persistFailure?.handle !== storedHandle.handle
        ? storedHandle
        : createActiveHandle(currentDocument);
  if (activeHandle !== storedHandle) setStoredHandle(activeHandle);
  if (
    persistFailure !== null &&
    currentDocument !== null &&
    persistFailure.documentId !== currentDocument.documentId
  )
    setPersistFailure(null);

  // Saving the handle's changes subscribes to it, so it stays an effect: the
  // subscription must end with its handle, and render may create handles that
  // React discards.
  useEffect(() => {
    if (!activeHandle) {
      return;
    }

    const { document, emittedRevisionIds, handle, latestRevisionId } =
      activeHandle;
    return handle.subscribe((event) => {
      const previousRevisionId = latestRevisionId.current;
      const revisionId = crypto.randomUUID();
      latestRevisionId.current = revisionId;
      emittedRevisionIds.add(revisionId);
      repository
        .persistRevision({
          documentId: document.documentId,
          definition: event.next,
          previousRevisionId,
          revisionId,
        })
        .then(
          () =>
            setPersistFailure((failure) =>
              failure?.documentId === document.documentId ? null : failure,
            ),
          (error: unknown) =>
            setPersistFailure({
              handle,
              documentId: document.documentId,
              error: error instanceof Error ? error : new Error(String(error)),
            }),
        );
    });
  }, [activeHandle, repository]);
  const unsavedChangeMessage =
    persistFailure !== null &&
    persistFailure.documentId === currentDocument?.documentId
      ? persistFailure.error.message
      : null;

  return { activeHandle, unsavedChangeMessage };
};
