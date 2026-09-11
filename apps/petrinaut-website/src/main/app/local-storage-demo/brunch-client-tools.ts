import {
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
  READ_PETRINAUT_DOCS_TOOL_NAME,
} from "@hashintel/brunch-agent-plugin-sdcpn";

/**
 * The one catalog of tools the browser answers on Brunch's behalf. The panel
 * transport admits their results and the history projection leaves them runnable.
 * The production preview has no interactive ask handler; fixture-specific tools
 * extend this default catalog without restoring the suspended ask path.
 * Kept free of React imports so the transport can load outside the DOM.
 */
export const brunchClientToolNames: ReadonlySet<string> = new Set([
  READ_PETRINAUT_DOCS_TOOL_NAME,
  LEGACY_READ_PETRINAUT_DOCS_TOOL_NAME,
]);
