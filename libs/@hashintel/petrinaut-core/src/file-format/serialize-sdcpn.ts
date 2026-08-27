import { serializeDocument } from "./document-text";
import { removeVisualInformation } from "./remove-visual-info";
import { SDCPN_FILE_FORMAT_VERSION } from "./types";

import type { SDCPN } from "../types/sdcpn";
import type { DocumentFormat } from "./document-text";

/**
 * Serialize an SDCPN to the canonical file format string — YAML by default,
 * JSON on request. Both encodings carry the same structure and re-import
 * identically.
 *
 * The output includes format metadata (`version`, `meta.generator`) and the
 * editor-supplied `title`. When `removeVisualInfo` is true, places/transitions
 * lose their `x`/`y` and types lose their `displayColor`/`iconSlug` — useful
 * when sharing the structural definition without baking in a particular
 * layout / palette.
 *
 * Pure — no DOM, no I/O. Callers are responsible for delivering the result
 * (browser download, clipboard, server upload, …).
 */
export function serializeSDCPN({
  petriNetDefinition,
  title,
  removeVisualInfo,
  format = "yaml",
}: {
  petriNetDefinition: SDCPN;
  title: string;
  removeVisualInfo?: boolean;
  format?: DocumentFormat;
}): string {
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

  return serializeDocument(payload, format);
}
