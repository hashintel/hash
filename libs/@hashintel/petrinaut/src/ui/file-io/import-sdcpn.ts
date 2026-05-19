import { type ImportResult, parseSDCPNFile } from "@hashintel/petrinaut-core";

/**
 * Opens a file picker dialog, reads an SDCPN JSON file, and parses it via
 * {@link parseSDCPNFile} (which lives in `/core/file-format/`). Returns null
 * if the user cancelled the picker.
 *
 * The pure parse logic + result shape live in `/core`; this wrapper just
 * sources the data via the DOM.
 */
export function importSDCPN(): Promise<ImportResult | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) {
        resolve(null);
        return;
      }

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const content = ev.target?.result as string;
          const loadedData: unknown = JSON.parse(content);
          resolve(parseSDCPNFile(loadedData));
        } catch (error) {
          resolve({
            ok: false,
            error: `Error reading file: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      };

      reader.onerror = () => {
        resolve({ ok: false, error: "Failed to read file" });
      };

      reader.readAsText(file);
    };

    input.click();
  });
}
