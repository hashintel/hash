import type { SDCPN } from "../../../core/types/sdcpn";

/**
 * Saves the SDCPN to a JSON file by triggering a browser download.
 * @param sdcpn - The SDCPN to save
 */
export function saveSDCPN(sdcpn: SDCPN): void {
  // Convert SDCPN to JSON string
  const jsonString = JSON.stringify(sdcpn, null, 2);

  // Create a blob from the JSON string
  const blob = new Blob([jsonString], { type: "application/json" });

  // Create a download link
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sdcpn.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_${Date.now()}.json`;

  // Trigger download
  document.body.appendChild(link);
  link.click();

  // Cleanup
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
