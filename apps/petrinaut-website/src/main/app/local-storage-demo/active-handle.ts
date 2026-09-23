import type { DocumentRecord } from "./documents/document-repository";
import type {
  DocumentRevisionId,
  PetrinautDocHandle,
} from "@hashintel/petrinaut-core";

/** The live handle of the open document, with the record it was opened from. */
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
