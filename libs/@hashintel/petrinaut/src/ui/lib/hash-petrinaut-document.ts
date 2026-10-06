import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import type { SDCPN } from "@hashintel/petrinaut-core";

type WithToJson = { toJSON: (key: string) => unknown };

const hasToJson = (value: unknown): value is WithToJson =>
  typeof value === "object" &&
  value !== null &&
  "toJSON" in value &&
  typeof value.toJSON === "function";

/** Orders by UTF-16 code unit. Own keys are unique, so never equal. */
const compareKeys = (left: string, right: string): number =>
  left < right ? -1 : 1;

/** `JSON.stringify(input)` with object keys sorted. */
const canonicalJson = (input: unknown, key: string): string | undefined => {
  const value = hasToJson(input) ? input.toJSON(key) : input;

  if (
    typeof value !== "object" ||
    value === null ||
    value instanceof Number ||
    value instanceof String ||
    value instanceof Boolean
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    // `Array.from` visits holes as `undefined`, which `JSON.stringify` writes as `null`.
    const items = Array.from(
      value,
      (item: unknown, index) => canonicalJson(item, String(index)) ?? "null",
    );
    return `[${items.join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const members: string[] = [];
  for (const memberKey of Object.keys(record).sort(compareKeys)) {
    const member = canonicalJson(record[memberKey], memberKey);
    if (member !== undefined) {
      members.push(`${JSON.stringify(memberKey)}:${member}`);
    }
  }
  return `{${members.join(",")}}`;
};

/**
 * SHA-256 of a net's canonical JSON, as 64 lowercase hex characters.
 *
 * Object keys are sorted by UTF-16 code unit, so their order never changes
 * the hash; arrays keep their order. Values follow `JSON.stringify`: `toJSON`
 * is honoured, `undefined` and function members are dropped, `undefined` and
 * functions in arrays become `null`, `NaN` and `±Infinity` become `null`, and
 * `-0` becomes `0`. A net and its JSON round trip hash the same.
 */
export const hashPetrinautDocument = (document: SDCPN): string =>
  bytesToHex(sha256(utf8ToBytes(canonicalJson(document, "") ?? "null")));
