import { useEffect, useState } from "react";

import {
  createJsonDocHandle,
  type DocumentRevisionId,
  type PetrinautDocHandle,
  type PetrinautHandleCapabilities,
} from "@hashintel/petrinaut-core";

import type { DocumentRecord, DocumentRepository } from "./document-repository";

const DEMO_CAPABILITIES = {
  disabledExtensions: [],
} satisfies PetrinautHandleCapabilities;

export type ActiveHandle = {
  handle: PetrinautDocHandle;
  document: DocumentRecord;
  /**
   * Every revision this handle has produced (plus the one it opened at). A
   * repository revision outside this set was written by someone else — another
   * tab, typically — and the handle must be recreated from it rather than keep
   * chaining edits from a predecessor the repository no longer holds.
   */
  emittedRevisionIds: Set<DocumentRevisionId>;
};

type PersistFailure = {
  /** The handle whose change was refused; it is replaced, not kept. */
  handle: PetrinautDocHandle;
  documentId: DocumentRecord["documentId"];
  incarnationId: DocumentRecord["incarnationId"];
  error: Error;
};

const createActiveHandle = (document: DocumentRecord): ActiveHandle => ({
  handle: createJsonDocHandle({
    id: document.documentId,
    initial: document.definition,
    initialRevisionId: document.revisionId,
    capabilities: DEMO_CAPABILITIES,
  }),
  document,
  emittedRevisionIds: new Set([document.revisionId]),
});

/**
 * The live, editable handle of the open document, and the message to show
 * when the repository refused to save its last change.
 *
 * The handle follows the repository: it is recreated from the repository's
 * record whenever the two diverge: another document is open, the record shows
 * a revision this handle never emitted (another tab wrote it), or the
 * repository refused one of this handle's changes, after which every further
 * change from it would be refused too, because each names the rejected
 * revision as predecessor. It is decided during render, not in an effect, so
 * no render pairs the open document with another document's handle.
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

  const activeHandle =
    currentDocument === null
      ? null
      : storedHandle?.document.documentId === currentDocument.documentId &&
          storedHandle.document.incarnationId ===
            currentDocument.incarnationId &&
          storedHandle.emittedRevisionIds.has(currentDocument.revisionId) &&
          persistFailure?.handle !== storedHandle.handle
        ? storedHandle
        : createActiveHandle(currentDocument);
  if (activeHandle !== storedHandle) setStoredHandle(activeHandle);
  if (
    persistFailure !== null &&
    currentDocument !== null &&
    (persistFailure.documentId !== currentDocument.documentId ||
      persistFailure.incarnationId !== currentDocument.incarnationId)
  )
    setPersistFailure(null);

  // Saving the handle's changes subscribes to it, so it stays an effect: the
  // subscription must end with its handle, and render may create handles that
  // React discards.
  useEffect(() => {
    if (!activeHandle) {
      return;
    }
    const { document, emittedRevisionIds, handle } = activeHandle;
    return handle.subscribe((event) => {
      emittedRevisionIds.add(event.revisionId);
      repository
        .persistRevision({
          documentId: document.documentId,
          incarnationId: document.incarnationId,
          definition: event.next,
          previousRevisionId: event.previousRevisionId,
          revisionId: event.revisionId,
        })
        .then(
          () =>
            setPersistFailure((failure) =>
              failure?.documentId === document.documentId &&
              failure.incarnationId === document.incarnationId
                ? null
                : failure,
            ),
          (error: unknown) =>
            setPersistFailure({
              handle,
              documentId: document.documentId,
              incarnationId: document.incarnationId,
              error: error instanceof Error ? error : new Error(String(error)),
            }),
        );
    });
  }, [activeHandle, repository]);

  const unsavedChangeMessage =
    persistFailure !== null &&
    persistFailure.documentId === currentDocument?.documentId &&
    persistFailure.incarnationId === currentDocument.incarnationId
      ? persistFailure.error.message
      : null;

  return { activeHandle, unsavedChangeMessage };
};
