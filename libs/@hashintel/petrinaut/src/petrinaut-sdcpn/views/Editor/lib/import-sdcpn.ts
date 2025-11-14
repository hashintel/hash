import type { SDCPN } from "../../../core/types/sdcpn";

/**
 * Opens a file picker dialog and loads an SDCPN from a JSON file.
 * @param onLoad - Callback function called with the loaded SDCPN
 * @param onError - Callback function called if there's an error
 */
export function importSDCPN(
  onLoad: (sdcpn: SDCPN) => void,
  onError?: (error: string) => void,
): void {
  // Create a file input element
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
      return;
    }

    // Read the file
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const loadedData: unknown = JSON.parse(content);

        // Type guard to validate SDCPN structure
        if (
          loadedData &&
          typeof loadedData === "object" &&
          "id" in loadedData &&
          "title" in loadedData &&
          "places" in loadedData &&
          "transitions" in loadedData &&
          Array.isArray(loadedData.places) &&
          Array.isArray(loadedData.transitions)
        ) {
          onLoad(loadedData as SDCPN);
        } else {
          const errorMessage = "Invalid SDCPN file format";
          if (onError) {
            onError(errorMessage);
          } else {
            // eslint-disable-next-line no-alert
            alert(errorMessage);
          }
        }
      } catch (error) {
        const errorMessage = `Error loading file: ${error instanceof Error ? error.message : String(error)}`;
        if (onError) {
          onError(errorMessage);
        } else {
          // eslint-disable-next-line no-alert
          alert(errorMessage);
        }
      }
    };

    reader.readAsText(file);
  };

  // Trigger file selection
  input.click();
}
