import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { SDCPN } from "../types/sdcpn";

/** Parts of a net that do not change what it simulates. */
export const petrinautNonSemanticParts = [
  "layout",
  "descriptions",
  "appearance",
  "metadata",
] as const;

export type PetrinautNonSemanticPart =
  (typeof petrinautNonSemanticParts)[number];

const fieldsByPart: Record<PetrinautNonSemanticPart, readonly string[]> = {
  layout: ["x", "y"],
  descriptions: ["description"],
  appearance: ["iconSlug", "displayColor", "visualizerCode"],
  metadata: ["metadata"],
};

const itemCollections = new Set([
  "places",
  "transitions",
  "types",
  "differentialEquations",
  "parameters",
  "scenarios",
  "metrics",
  "componentInstances",
  "subnets",
]);

/** Copies a net or item without `fields`, recursing into item collections only. */
const withoutFields = (
  value: object,
  fields: ReadonlySet<string>,
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !fields.has(key))
      .map(([key, member]) => [
        key,
        itemCollections.has(key) && Array.isArray(member)
          ? member.map((item: object) => withoutFields(item, fields))
          : member,
      ]),
  );

/** JSON with object keys sorted, so key order never changes the result. */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    // `Array.from` visits holes, which JSON writes as `null` like `undefined`.
    const items = Array.from(value, (item: unknown) =>
      item === undefined ? "null" : canonicalJson(item),
    );
    return `[${items.join(",")}]`;
  }
  if (typeof value !== "object" || value === null) {
    return JSON.stringify(value);
  }
  const record = value as Record<string, unknown>;
  const members = Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`);
  return `{${members.join(",")}}`;
};

export type HashPetrinautDocumentOptions = {
  /** Parts left out of the hash, so changing them keeps it. */
  readonly exclude?: readonly PetrinautNonSemanticPart[];
};

/**
 * SHA-256 (hex) of the net's JSON with object keys sorted; equal to the hash
 * of its JSON round trip. `exclude: petrinautNonSemanticParts` hashes only
 * what the net simulates.
 */
export const hashPetrinautDocument = (
  document: SDCPN,
  { exclude = [] }: HashPetrinautDocumentOptions = {},
): string => {
  const fields = new Set(exclude.flatMap((part) => fieldsByPart[part]));
  const hashed = fields.size === 0 ? document : withoutFields(document, fields);
  return bytesToHex(sha256(utf8ToBytes(canonicalJson(hashed))));
};
