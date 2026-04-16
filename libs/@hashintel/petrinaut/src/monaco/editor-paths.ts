/**
 * Re-exports from the centralized document-uris module.
 * Monaco components import from here for convenience.
 */
export {
  getDocumentUri,
  getScenarioDocumentUri,
  parseDocumentUri,
} from "../lsp/lib/document-uris";
