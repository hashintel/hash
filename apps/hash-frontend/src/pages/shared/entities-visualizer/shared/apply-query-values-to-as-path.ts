/**
 * Merging URL-owned state into a Next.js `asPath` without disturbing anyone
 * else's query parameters. Each URL-synced state slice (e.g. the filter
 * state) owns a fixed set of keys and rewrites only those; all other
 * parameters pass through byte-for-byte, so concurrent writers converge
 * instead of clobbering each other.
 */

/**
 * Percent-encodes a query value while leaving characters that are legal in a URL
 * query and aid readability (`:` `/` `@` `,` `;`) intact, so type/property URLs
 * and entity ids remain legible rather than turning into `%3A%2F%2F` noise.
 * (`~`, which entity ids also contain, is unreserved and never encoded.)
 */
const encodeQueryValue = (value: string): string =>
  encodeURIComponent(value)
    .replace(/%3A/g, ":")
    .replace(/%2F/g, "/")
    .replace(/%40/g, "@")
    .replace(/%2C/g, ",")
    .replace(/%3B/g, ";");

const parseRawPairs = (search: string): [string, string][] =>
  search
    ? search.split("&").map((pair): [string, string] => {
        const equalsIndex = pair.indexOf("=");
        return equalsIndex === -1
          ? [pair, ""]
          : [pair.slice(0, equalsIndex), pair.slice(equalsIndex + 1)];
      })
    : [];

const groupRawValuesByKey = (
  pairs: [string, string][],
): Map<string, string[]> => {
  const byKey = new Map<string, string[]>();
  for (const [key, rawValue] of pairs) {
    const existing = byKey.get(key);
    if (existing) {
      existing.push(rawValue);
    } else {
      byKey.set(key, [rawValue]);
    }
  }
  return byKey;
};

const arraysEqual = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * Merges the given owned parameter values into an existing `asPath`, leaving
 * any parameter outside `ownedKeys` in place. An owned key absent from
 * `values` is removed from the URL. Comparison is performed against the raw
 * (already-encoded) query so the result is stable across re-renders, and
 * values are written with {@link encodeQueryValue} to keep URLs readable.
 * Returns whether the resulting path differs so callers can avoid redundant
 * navigations.
 */
export const applyQueryValuesToAsPath = ({
  asPath,
  ownedKeys,
  values,
}: {
  asPath: string;
  ownedKeys: readonly string[];
  values: Record<string, string | string[]>;
}): { changed: boolean; nextAsPath: string } => {
  const [path = "", search = ""] = asPath.split("?");
  const existingPairs = parseRawPairs(search);
  const currentByKey = groupRawValuesByKey(existingPairs);

  const desiredByKey = new Map<string, string[]>();
  for (const key of ownedKeys) {
    const value = values[key];
    if (value === undefined) {
      continue;
    }
    const list = Array.isArray(value) ? value : [value];
    desiredByKey.set(key, list.map(encodeQueryValue));
  }

  const changed = ownedKeys.some(
    (key) =>
      !arraysEqual(currentByKey.get(key) ?? [], desiredByKey.get(key) ?? []),
  );

  if (!changed) {
    return { changed: false, nextAsPath: asPath };
  }

  const ownedKeySet = new Set<string>(ownedKeys);

  const rebuilt = existingPairs
    .filter(([key]) => !ownedKeySet.has(key))
    .map(([key, rawValue]) => (rawValue === "" ? key : `${key}=${rawValue}`));

  for (const key of ownedKeys) {
    for (const rawValue of desiredByKey.get(key) ?? []) {
      rebuilt.push(`${key}=${rawValue}`);
    }
  }

  const nextSearch = rebuilt.join("&");

  return {
    changed: true,
    nextAsPath: nextSearch ? `${path}?${nextSearch}` : path,
  };
};
