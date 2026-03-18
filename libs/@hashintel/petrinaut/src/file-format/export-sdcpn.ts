import type { SDCPN } from "../core/types/sdcpn";
import { removeVisualInformation } from "./remove-visual-info";
import { SDCPN_FILE_FORMAT_VERSION } from "./types";

/**
 * Saves the SDCPN to a JSON file by triggering a browser download.
 * The file includes format metadata (version, meta.generator).
 *
 * @param petriNetDefinition - The SDCPN to save
 * @param title - The title of the SDCPN
 * @param removeVisualInfo - If true, removes visual positioning information (x, y) from places and transitions
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
  const sdcpnToExport = removeVisualInfo
    ? removeVisualInformation(petriNetDefinition)
    : petriNetDefinition;

  const payload = {
    ...sdcpnToExport,
    version: SDCPN_FILE_FORMAT_VERSION,
    meta: {
      generator: "Petrinaut",
    },
    title,
  };

  const jsonString = JSON.stringify(payload, null, 2);

  const blob = new Blob([jsonString], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${new Date().toISOString().replace(/:/g, "-")}.json`;

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
