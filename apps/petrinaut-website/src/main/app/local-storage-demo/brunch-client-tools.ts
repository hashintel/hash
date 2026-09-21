import {
  layoutPetrinautNetToolName,
  mutatePetrinautNetToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";

/**
 * The one catalog of tools the browser answers on Brunch's behalf. The panel
 * transport admits their results and the history projection leaves them
 * runnable. The production preview has no interactive ask handler;
 * Kept free of React imports so the transport can load outside the DOM.
 */
export const brunchClientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
]);

/** Batched construction: reads, one batch mutation and layout. */
export const batchedConstructionClientToolNames: ReadonlySet<string> = new Set([
  ...brunchClientToolNames,
  readPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  mutatePetrinautNetToolName,
  layoutPetrinautNetToolName,
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
