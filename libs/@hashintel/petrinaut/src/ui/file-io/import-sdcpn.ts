import {
  parseSDCPNDocument,
  type ImportResult,
} from "@hashintel/petrinaut-core";

/**
 * Opens a file picker dialog, reads an SDCPN file (YAML or JSON), and parses
 * it via {@link parseSDCPNDocument} (which lives in `/core/file-format/`).
 * Returns null if the user cancelled the picker.
 *
 * The pure parse logic + result shape live in `/core`; this wrapper just
 * sources the text via the DOM.
 */
export function importSDCPN(): Promise<ImportResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".yaml,.yml,.json";

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        const content = ev.target?.result;
        resolve(
          typeof content === "string"
            ? parseSDCPNDocument(content)
            : { ok: false, error: "Failed to read file" },
        );
      };

      reader.onerror = () => {
        resolve({ ok: false, error: "Failed to read file" });
      };

      reader.readAsText(file);
    };

    input.click();
  });
}
