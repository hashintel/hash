import {
  parseSDCPNDocument,
  type ImportResult,
} from "@hashintel/petrinaut-core";

import { pickFile, readFileText } from "./pick-file";

/**
 * Opens a file picker dialog, reads an SDCPN file (YAML or JSON), and parses
 * it via {@link parseSDCPNDocument} (which lives in `/core/file-format/`).
 * Returns null if the user cancelled the picker.
 *
 * The pure parse logic + result shape live in `/core`; this wrapper just
 * sources the text via the DOM.
 */
export const importSDCPN = async (): Promise<ImportResult | null> => {
  const file = await pickFile(".yaml,.yml,.json");
  if (!file) {
    return null;
  }
  const content = await readFileText(file);
  return content === null
    ? { ok: false, error: "Failed to read file" }
    : parseSDCPNDocument(content);
};
