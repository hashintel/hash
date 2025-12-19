import type { SDCPN } from "../../../core/types/sdcpn";
import { removeVisualInformation } from "./remove-visual-info";

/**
 * Saves the SDCPN to a JSON file by triggering a browser download.
 * @param petriNetDefinition - The SDCPN to save
 * @param title - The title of the SDCPN
 * @param removeVisualInfo - If true, removes visual positioning information (x, y, width, height) from places and transitions
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
  // Optionally remove visual information
  const sdcpnToExport = removeVisualInfo
    ? removeVisualInformation(petriNetDefinition)
    : petriNetDefinition;

  // Convert SDCPN to JSON string
  const jsonString = JSON.stringify({ title, ...sdcpnToExport }, null, 2);

  // Create a blob from the JSON string
  const blob = new Blob([jsonString], { type: "application/json" });

  // Create a download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${new Date().toISOString()}.json`;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
