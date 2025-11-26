import type { SDCPN } from "../../../core/types/sdcpn";

/**
 * Saves the SDCPN to a JSON file by triggering a browser download.
 * @param petriNetDefinition - The SDCPN to save
 * @param title - The title of the SDCPN
 */
export function exportSDCPN({
  petriNetDefinition,
  title,
}: { petriNetDefinition: SDCPN; title: string }): void {
  // Convert SDCPN to JSON string
  const jsonString = JSON.stringify({ title, ...petriNetDefinition }, null, 2);

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
