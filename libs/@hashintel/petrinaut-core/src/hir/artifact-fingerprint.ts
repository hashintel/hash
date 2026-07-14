import type { PetrinautExtensionSettings } from "../extensions";
import type { SDCPN } from "../types/sdcpn";

function stableJson(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(
      ([key, entryValue]) => `${JSON.stringify(key)}:${stableJson(entryValue)}`,
    )
    .join(",")}}`;
}

/**
 * Fingerprints the exact sanitized model snapshot and extension settings used
 * to compile HIR artifacts. The hash is a compatibility guard, not a security
 * primitive: it prevents buffer programs with baked offsets from being run
 * against a different schema or code snapshot.
 */
export function fingerprintHirCompilationInput(
  sanitizedSdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): string {
  const serialized = stableJson({ extensions, sdcpn: sanitizedSdcpn });
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;

  for (let index = 0; index < serialized.length; index += 1) {
    // eslint-disable-next-line no-bitwise -- FNV-1a is intentionally bitwise.
    hash ^= BigInt(serialized.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }

  return hash.toString(16).padStart(16, "0");
}
