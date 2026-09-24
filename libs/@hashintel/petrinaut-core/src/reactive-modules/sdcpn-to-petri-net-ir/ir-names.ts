/**
 * Derives the IR's names from display names: `Idle Tankers` becomes
 * `IdleTankers`, a name that would start with a digit gets a prefix, and a
 * collision gets a numeric suffix.
 */

const capitalize = (part: string): string =>
  part.charAt(0).toUpperCase() + part.slice(1);

/** An UpperCamelCase name for `display`, or `prefix` when nothing is left of it. */
export const toIrName = (display: string, prefix: string): string => {
  const joined = display
    .trim()
    .split(/[^A-Za-z0-9]+/u)
    .filter((part) => part !== "")
    .map(capitalize)
    .join("");
  if (joined === "") {
    return prefix;
  }
  return /^[A-Z]/u.test(joined) ? joined : `${prefix}${joined}`;
};

/** A lower_snake identifier for the net itself. */
export const toIrNetName = (display: string): string => {
  // Every run of separators is one underscore by now, so only a single one
  // can lead or trail; matching one keeps the pass linear in the length.
  const cleaned = display
    .trim()
    .replace(/[^A-Za-z0-9]+/gu, "_")
    .replace(/^_|_$/gu, "")
    .toLowerCase();
  if (cleaned === "") {
    return "net";
  }
  return /^[A-Za-z_]/u.test(cleaned) ? cleaned : `net_${cleaned}`;
};

export type IrNamePool = {
  /** Claims a name for `display`, suffixing `2`, `3`, … on collision. */
  claim: (display: string, prefix: string) => string;
};

/**
 * Hands out unique names. `reserved` names count as taken from the start, so
 * a place called `X` becomes `X2` rather than shadowing a name the generated
 * module needs.
 */
export const createIrNamePool = (
  reserved: Iterable<string> = [],
): IrNamePool => {
  const taken = new Set(reserved);
  return {
    claim: (display, prefix) => {
      const base = toIrName(display, prefix);
      let candidate = base;
      for (let index = 2; taken.has(candidate); index += 1) {
        candidate = `${base}${index}`;
      }
      taken.add(candidate);
      return candidate;
    },
  };
};
