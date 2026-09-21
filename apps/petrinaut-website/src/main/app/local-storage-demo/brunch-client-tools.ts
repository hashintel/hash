import {
  draftPetrinautExperimentToolName,
  layoutPetrinautNetToolName,
  mutatePetrinautNetToolName,
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautDiagnosticsToolName,
  readPetrinautNetToolName,
} from "@hashintel/brunch-agent-plugin-sdcpn";
import { petrinautAiTools } from "@hashintel/petrinaut-core";

/**
 * The one catalog of tools the browser answers on Brunch's behalf. The panel
 * transport admits their results and the history projection leaves them
 * runnable. The production preview has no interactive ask handler;
 * Kept free of React imports so the transport can load outside the DOM.
 */
export const brunchClientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
]);

/** Batched construction: reads, one batch mutation, layout and one session draft. */
export const batchedConstructionClientToolNames: ReadonlySet<string> = new Set([
  ...brunchClientToolNames,
  readPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  mutatePetrinautNetToolName,
  layoutPetrinautNetToolName,
  draftPetrinautExperimentToolName,
]);

/** Literal stock catalogue handled by Petrinaut's existing static panel tools. */
export const canonicalPetrinautClientToolNames: ReadonlySet<string> = new Set(
  Object.keys(petrinautAiTools),
);

/**
 * Compatibility catalogue for the canonical tracer. Existing conversations
 * can still contain Brunch's custom construction tools, while new canonical
 * calls remain static and execute through Petrinaut's stock handlers.
 */
export const canonicalParityClientToolNames: ReadonlySet<string> = new Set([
  ...batchedConstructionClientToolNames,
  ...canonicalPetrinautClientToolNames,
]);

/**
 * The Brunch-named tools the browser executes without asking: the panel
 * routes them to the host's automatic tools.
 */
export const brunchPetrinautAutomaticToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  readPetrinautNetToolName,
  readPetrinautDiagnosticsToolName,
  layoutPetrinautNetToolName,
  mutatePetrinautNetToolName,
]);

/**
 * The Brunch-named tools the browser renders as a widget the person acts on:
 * the panel routes them to the host's interactive tools. The experiment draft
 * auto-submits its prepared state so Brunch's turn continues, and keeps its
 * Run and Dismiss actions for the person.
 */
export const brunchPetrinautInteractiveToolNames: ReadonlySet<string> = new Set(
  [draftPetrinautExperimentToolName],
);

/**
 * The Brunch-named tools are host dynamic tools in every mode: the transport
 * projects them as `dynamic-tool` parts and the panel routes them to the
 * host's automatic or interactive tools rather than to Petrinaut's static
 * registry.
 */
export const brunchPetrinautDynamicToolNames: ReadonlySet<string> = new Set([
  ...brunchPetrinautAutomaticToolNames,
  ...brunchPetrinautInteractiveToolNames,
]);
