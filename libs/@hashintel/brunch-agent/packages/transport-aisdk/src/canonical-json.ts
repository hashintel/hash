const objectValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Equality ignores object insertion order, but never array order or field presence. */
const canonicalJson = (value: unknown): string => {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (objectValue(entry)) {
      return Object.fromEntries(
        Object.keys(entry)
          .sort()
          .map((key) => [key, normalize(entry[key])]),
      );
    }
    return entry;
  };
  return JSON.stringify(normalize(value));
};

export const canonicalJsonEquals = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);
