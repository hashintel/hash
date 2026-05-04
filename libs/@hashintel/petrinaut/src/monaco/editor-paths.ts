/**
 * Re-exports from the centralized document-uris module.
 * Monaco components import from here for convenience.
 */
export {
  getDocumentUri,
  getMetricDocumentUri,
  getScenarioDocumentUri,
  parseDocumentUri,
} from "../core/lsp/lib/document-uris";
