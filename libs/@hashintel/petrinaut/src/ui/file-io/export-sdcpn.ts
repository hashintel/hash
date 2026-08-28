import {
  serializeSDCPN,
  type DocumentFormat,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { downloadBlob, timestampedFilename } from "../lib/download-blob";

const formatDetails: Record<
  DocumentFormat,
  { mimeType: string; extension: string }
> = {
  yaml: { mimeType: "application/yaml", extension: "yaml" },
  json: { mimeType: "application/json", extension: "json" },
};

/**
 * Saves the SDCPN to a YAML (default) or JSON file by triggering a browser
 * download. The pure serialization lives in `/core/file-format/serialize-sdcpn`;
 * this wrapper just delivers the result via the browser download helper.
 *
 * @param petriNetDefinition - The SDCPN to save
 * @param title - The title of the SDCPN
 * @param removeVisualInfo - If true, removes visual positioning information
 *   (x, y) from places and transitions
 * @param format - Textual encoding of the file; defaults to YAML
 */
export function exportSDCPN({
  petriNetDefinition,
  title,
  removeVisualInfo,
  format = "yaml",
}: {
  petriNetDefinition: SDCPN;
  title: string;
  removeVisualInfo?: boolean;
  format?: DocumentFormat;
}): void {
  const { mimeType, extension } = formatDetails[format];
  downloadBlob({
    content: serializeSDCPN({
      petriNetDefinition,
      title,
      removeVisualInfo,
      format,
    }),
    mimeType,
    filename: timestampedFilename(title, extension),
  });
}
