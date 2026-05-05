import type { SDCPN } from "../core/types/sdcpn";
import {
  legacySdcpnFileSchema,
  SDCPN_FILE_FORMAT_VERSION,
  sdcpnFileSchema,
} from "./types";

type SDCPNWithTitle = SDCPN & { title: string };

/**
 * Result of attempting to import an SDCPN file.
 */
export type ImportResult =
  | { ok: true; sdcpn: SDCPNWithTitle; hadMissingPositions: boolean }
  | { ok: false; error: string };

/**
 * Checks whether any node positions are missing.
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
 * Fills missing visual information so the SDCPN satisfies the runtime type.
 * - Places/transitions at (0, 0) will be laid out by ELK after import.
 * - Colors get default iconSlug and displayColor when missing (e.g. exported without visual info).
 */
const fillMissingVisualInfo = (sdcpn: {
  title: string;
  places: Array<{ x?: number; y?: number }>;
  transitions: Array<{ x?: number; y?: number }>;
  types: Array<{ iconSlug?: string; displayColor?: string }>;
}): SDCPNWithTitle =>
  ({
    ...sdcpn,
    places: sdcpn.places.map((place) => ({
      ...place,
      x: place.x ?? 0,
      y: place.y ?? 0,
    })),
    transitions: sdcpn.transitions.map((transition) => ({
      ...transition,
      x: transition.x ?? 0,
      y: transition.y ?? 0,
    })),
    types: sdcpn.types.map((type) => ({
      ...type,
      iconSlug: type.iconSlug ?? "circle",
      displayColor: type.displayColor ?? "#808080",
    })),
  }) as SDCPNWithTitle;

/**
 * Parses raw JSON data into an SDCPN, handling versioned, legacy, and old pre-2025-11-28 formats.
 */
export const parseSDCPNFile = (data: unknown): ImportResult => {
  // Try the versioned format first
  const versioned = sdcpnFileSchema.safeParse(data);
  if (versioned.success) {
    const { version: _version, meta: _meta, ...sdcpnData } = versioned.data;
    return {
      ok: true,
      sdcpn: fillMissingVisualInfo(sdcpnData),
      hadMissingPositions: hasMissingPositions(sdcpnData),
    };
  }

  // If the data has a `version` field but failed the versioned schema, reject it
  // rather than falling through to the legacy path (which would silently accept
  // future-versioned files by stripping the unknown `version` key).
  if (typeof data === "object" && data !== null && "version" in data) {
    const version = (data as { version: unknown }).version;
    if (
      typeof version === "number" &&
      version >= 1 &&
      version <= SDCPN_FILE_FORMAT_VERSION
    ) {
      // Supported version but invalid structure — show actual Zod errors
      return {
        ok: false,
        error: `Invalid SDCPN file: ${versioned.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
      };
    }
    return {
      ok: false,
      error: "Unsupported SDCPN file format version",
    };
  }

  // Fall back to legacy format (current schema without version/meta)
  const legacy = legacySdcpnFileSchema.safeParse(data);
  if (legacy.success) {
    return {
      ok: true,
      sdcpn: fillMissingVisualInfo(legacy.data),
      hadMissingPositions: hasMissingPositions(legacy.data),
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
