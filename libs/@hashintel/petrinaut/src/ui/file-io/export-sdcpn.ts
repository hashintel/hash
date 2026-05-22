import { serializeSDCPN, type SDCPN } from "@hashintel/petrinaut-core";

import { downloadBlob, timestampedFilename } from "../lib/download-blob";

/**
 * Saves the SDCPN to a JSON file by triggering a browser download. The pure
 * serialization lives in `/core/file-format/serialize-sdcpn`; this wrapper
 * just delivers the result via the browser download helper.
 *
 * @param petriNetDefinition - The SDCPN to save
 * @param title - The title of the SDCPN
 * @param removeVisualInfo - If true, removes visual positioning information
 *   (x, y) from places and transitions
 */
export function exportSDCPN({
  petriNetDefinition,
  title,
  removeVisualInfo,
}: {
  petriNetDefinition: SDCPN;
  title: string;
  removeVisualInfo?: boolean;
}): void {
  downloadBlob({
    content: serializeSDCPN({ petriNetDefinition, title, removeVisualInfo }),
    mimeType: "application/json",
    filename: timestampedFilename(title, "json"),
  });
}
