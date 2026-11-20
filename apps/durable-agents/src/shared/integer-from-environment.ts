/** A process environment, or a test's stand-in for one. */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * Variable `name` of `environment` as an integer of 1 or more, `fallback`
 * when it is unset or blank, and with `infinite`, `Infinity` for
 * `Infinity`. A value that is not a number of the right kind throws, so a
 * typo does not silently run on the default.
 */
export const integerFromEnvironment = (
  environment: Environment,
  name: string,
  fallback: number,
  { infinite }: { readonly infinite: boolean },
): number => {
  const raw = environment[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  if (infinite && raw.trim() === "Infinity") return Infinity;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(
      `${name} must be an integer of 1 or more${infinite ? " or Infinity" : ""}: ${raw}.`,
    );
  return value;
};
