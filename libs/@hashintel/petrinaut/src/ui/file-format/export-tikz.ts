import { sdcpnToTikZ } from "../../core/file-format/sdcpn-to-tikz";
import type { SDCPN } from "../../core/types/sdcpn";
import { downloadBlob, timestampedFilename } from "../lib/download-blob";

/**
 * Exports the Petri net structure as a standalone TikZ/LaTeX document — the
 * pure SDCPN → TikZ conversion lives in `/core/file-format/sdcpn-to-tikz`;
 * this wrapper just delivers the result via a browser download.
 */
export function exportTikZ({
  petriNetDefinition,
  title,
}: {
  petriNetDefinition: SDCPN;
  title: string;
}): void {
  downloadBlob({
    content: sdcpnToTikZ(petriNetDefinition, title),
    mimeType: "application/x-tex",
    filename: timestampedFilename(title, "tex"),
  });
}
