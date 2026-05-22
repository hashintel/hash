import {
	parseClipboardPayload,
	serializeSelection,
	type SDCPN,
	type SelectionMap,
} from "@hashintel/petrinaut-core";
import type { PetrinautCommands } from "../../react";

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
	try {
		await navigator.clipboard.writeText(json);
	} catch {
		// Clipboard write can fail (permissions denied, non-secure context, etc.)
	}
}

/**
 * Read from the system clipboard and paste into the SDCPN via the typed
 * `applyClipboardPaste` command. Returns the IDs of newly created items
 * (for selection), or `null` if the clipboard did not contain valid
 * petrinaut data.
 */
export async function pasteFromClipboard(
	applyClipboardPaste: PetrinautCommands["applyClipboardPaste"],
): Promise<Array<{ type: string; id: string }> | null> {
	let text: string;
	try {
		text = await navigator.clipboard.readText();
	} catch {
		// Clipboard read can fail (permissions denied, non-secure context, etc.)
		return null;
	}
	const payload = parseClipboardPayload(text);

	if (!payload) {
		return null;
	}

	const { newItemIds } = applyClipboardPaste({ payload });
	return newItemIds;
}
