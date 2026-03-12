import type { SDCPN } from "../core/types/sdcpn";
import { legacySdcpnFileSchema, sdcpnFileSchema } from "./types";

type SDCPNWithTitle = SDCPN & { title: string };

/**
 * Result of attempting to import an SDCPN file.
 */
export type ImportResult =
  | { ok: true; sdcpn: SDCPNWithTitle; hadMissingPositions: boolean }
  | { ok: false; error: string };

/**
 * Checks whether any place or transition has a missing (undefined) x or y.
 */
const hasMissingPositions = (sdcpn: {
  places: { x?: number; y?: number }[];
  transitions: { x?: number; y?: number }[];
}): boolean => {
  for (const node of [...sdcpn.places, ...sdcpn.transitions]) {
    if (node.x === undefined || node.y === undefined) {
      return true;
    }
  }
  return false;
};

/**
 * Fills missing x/y with 0 so the SDCPN satisfies the runtime type.
 * Nodes at (0, 0) will be laid out by ELK after import.
 */
const fillMissingPositions = (
  parsed: ReturnType<typeof legacySdcpnFileSchema.parse>,
): SDCPNWithTitle => ({
  ...parsed,
  places: parsed.places.map((place) => ({
    ...place,
    x: place.x ?? 0,
    y: place.y ?? 0,
  })),
  transitions: parsed.transitions.map((transition) => ({
    ...transition,
    x: transition.x ?? 0,
    y: transition.y ?? 0,
  })),
});

/**
 * Parses raw JSON data into an SDCPN, handling both versioned and legacy formats.
 */
export const parseSDCPNFile = (data: unknown): ImportResult => {
  // Try the versioned format first
  const versioned = sdcpnFileSchema.safeParse(data);
  if (versioned.success) {
    const { version: _version, meta: _meta, ...sdcpnData } = versioned.data;
    const hadMissing = hasMissingPositions(sdcpnData);
    return {
      ok: true,
      sdcpn: fillMissingPositions(sdcpnData),
      hadMissingPositions: hadMissing,
    };
  }

  // Fall back to legacy format
  const legacy = legacySdcpnFileSchema.safeParse(data);
  if (legacy.success) {
    const hadMissing = hasMissingPositions(legacy.data);
    return {
      ok: true,
      sdcpn: fillMissingPositions(legacy.data),
      hadMissingPositions: hadMissing,
    };
  }

  return {
    ok: false,
    error: `Invalid SDCPN file: ${legacy.error.issues.map((i) => i.message).join(", ")}`,
  };
};

/**
 * Opens a file picker dialog and reads an SDCPN JSON file.
 * Returns a promise that resolves with the import result, or null if the user cancelled.
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
