import {
  layoutPetrinautNetToolName,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  legacyLayoutPetrinautNetToolName,
  legacyMutatePetrinautNetToolName,
  legacyReadPetrinautDiagnosticsToolName,
  legacyReadPetrinautNetToolName,
  mutatePetrinautNetToolName,
  observedConstructionBrowserToolNames,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";

/**
 * The one catalog of tools the browser answers on Brunch's behalf. The panel
 * transport admits their results and the history projection leaves them
 * runnable. The production preview has no interactive ask handler;
 * fixture-specific tools extend this default catalog without restoring the
 * suspended ask path. Kept free of React imports so the transport can load
 * outside the DOM.
 *
 * Every mode answers the documentation read; the construction modes add the
 * net, diagnostics, mutation and layout tools under both the Brunch names and
 * the legacy names retained histories still carry.
 */
export const brunchClientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
]);

/** The conversation-bound observed-construction candidate: one canonical mutation per call. */
export const constructionClientToolNames: ReadonlySet<string> = new Set([
  ...brunchClientToolNames,
  ...observedConstructionBrowserToolNames,
  legacyReadPetrinautNetToolName,
  legacyReadPetrinautDiagnosticsToolName,
]);

/** Batched construction: reads, one batch mutation and layout. */
export const batchedConstructionClientToolNames: ReadonlySet<string> = new Set([
  ...brunchClientToolNames,
  readPetrinautNetToolName,
  legacyReadPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  legacyReadPetrinautDiagnosticsToolName,
  mutatePetrinautNetToolName,
  legacyMutatePetrinautNetToolName,
  layoutPetrinautNetToolName,
  legacyLayoutPetrinautNetToolName,
]);

/**
 * The Brunch-named tools are host dynamic tools in every mode: the transport
 * projects them as `dynamic-tool` parts and the panel routes them to the
 * host's automatic tools rather than to Petrinaut's static registry.
 */
export const brunchPetrinautDynamicToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  layoutPetrinautNetToolName,
  mutatePetrinautNetToolName,
]);
