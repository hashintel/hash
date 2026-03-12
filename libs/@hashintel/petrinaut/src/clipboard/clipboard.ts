import type { SDCPN } from "../core/types/sdcpn";
import type { SelectionMap } from "../state/selection";
import { pastePayloadIntoSDCPN } from "./paste";
import { parseClipboardPayload, serializeSelection } from "./serialize";

export { deduplicateName } from "./deduplicate-name";
export { pastePayloadIntoSDCPN } from "./paste";
export { parseClipboardPayload, serializeSelection } from "./serialize";
export type { ClipboardPayload } from "./types";
export { CLIPBOARD_FORMAT_VERSION } from "./types";

/**
 * Copy the current selection to the system clipboard.
 */
export async function copySelectionToClipboard(
  sdcpn: SDCPN,
  selection: SelectionMap,
  documentId: string | null,
): Promise<void> {
  const payload = serializeSelection(sdcpn, selection, documentId);
  const json = JSON.stringify(payload);
  await navigator.clipboard.writeText(json);
}

/**
 * Read from the system clipboard and paste into the SDCPN.
 * Returns the IDs of newly created items (for selection), or null if clipboard
 * didn't contain valid petrinaut data.
 */
export async function pasteFromClipboard(
  mutatePetriNetDefinition: (mutateFn: (sdcpn: SDCPN) => void) => void,
): Promise<Array<{ type: string; id: string }> | null> {
  const text = await navigator.clipboard.readText();
  const payload = parseClipboardPayload(text);

  if (!payload) {
    return null;
  }

  let newItemIds: Array<{ type: string; id: string }> = [];
  mutatePetriNetDefinition((sdcpn) => {
    const result = pastePayloadIntoSDCPN(sdcpn, payload);
    newItemIds = result.newItemIds;
  });

  return newItemIds;
}
