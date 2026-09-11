/**
 * @layerRoot core.handle
 * @role Stateful handle wrapping a document, emitting change events to subscribers
 */

export {
  createJsonDocHandle,
  type CreateJsonDocHandleOptions,
} from "./json-doc-handle";
export type {
  DocChangeEvent,
  DocHandleState,
  DocumentId,
  DocumentRevisionId,
  HistoryEntry,
  PetrinautDocHandle,
  PetrinautHistory,
  PetrinautPatch,
} from "./types";
