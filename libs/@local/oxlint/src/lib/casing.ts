/**
 * Classifies and converts identifier names between casings.
 *
 * Conversions preserve leading and trailing `_` / `$` affixes (`_private`, `value$`). Checks ignore them.
 */

/**
 * Supported naming formats, mirroring the formats of `@typescript-eslint/naming-convention`.
 *
 * The non-strict camel and Pascal variants allow consecutive capitals (`userID`), the strict
 * variants do not (`userId`). Conversions always produce the strict spelling.
 */
export type Casing =
  | "camelCase"
  | "strictCamelCase"
  | "PascalCase"
  | "StrictPascalCase"
  | "snake_case"
  | "UPPER_CASE";

interface AffixedName {
  readonly prefix: string;
  readonly core: string;
  readonly suffix: string;
}

const leadingAffixPattern = /^[$_]+/u;
const trailingAffixPattern = /[$_]+$/u;
const separatorPattern = /[\s_-]+/u;
const lowerToUpperPattern = /(?<lower>[\p{Ll}\p{N}])(?<upper>\p{Lu})/gu;
const acronymEndPattern = /(?<acronym>\p{Lu})(?<word>\p{Lu}\p{Ll})/gu;
const startsUpperPattern = /^\p{Lu}/u;
const startsLowerPattern = /^\p{Ll}/u;
const consecutiveUpperPattern = /\p{Lu}{2}/u;
const invalidSnakeSeparatorPattern = /_{2}|[\s-]/u;

const splitAffixes = (name: string): AffixedName => {
  const withoutPrefix = name.replace(leadingAffixPattern, "");
  const core = withoutPrefix.replace(trailingAffixPattern, "");

  return {
    core,
    prefix: name.slice(0, name.length - withoutPrefix.length),
    suffix: withoutPrefix.slice(core.length),
  };
};

/**
 * Splits text into its words.
 *
 * Word boundaries occur at `_`, `-` and whitespace, at lower-to-upper transitions (`fooBar`), and
 * at the end of acronyms (`XMLHttp` → `XML`, `Http`). Digits stay attached to the preceding word
 * (`base64Encode` → `base64`, `Encode`).
 */
export const splitWords = (text: string): string[] =>
  text
    .replaceAll(lowerToUpperPattern, "$<lower> $<upper>")
    .replaceAll(acronymEndPattern, "$<acronym> $<word>")
    .split(separatorPattern)
    .filter((word) => word.length > 0);

const capitalize = (word: string): string => {
  const [first = "", ...rest] = word;

  return first.toUpperCase() + rest.join("").toLowerCase();
};

const lowerCamel = (words: readonly string[]): string => {
  const [first = "", ...rest] = words;

  return first.toLowerCase() + rest.map((word) => capitalize(word)).join("");
};

const upperCamel = (words: readonly string[]): string =>
  words.map((word) => capitalize(word)).join("");

const joiners: Readonly<Record<Casing, (words: readonly string[]) => string>> =
  {
    PascalCase: upperCamel,
    StrictPascalCase: upperCamel,
    UPPER_CASE: (words) => words.map((word) => word.toUpperCase()).join("_"),
    camelCase: lowerCamel,
    snake_case: (words) => words.map((word) => word.toLowerCase()).join("_"),
    strictCamelCase: lowerCamel,
  };

const matchers: Readonly<Record<Casing, (core: string) => boolean>> = {
  PascalCase: (core) =>
    !startsLowerPattern.test(core) && !separatorPattern.test(core),
  StrictPascalCase: (core) =>
    !startsLowerPattern.test(core) &&
    !separatorPattern.test(core) &&
    !consecutiveUpperPattern.test(core),
  UPPER_CASE: (core) =>
    core === core.toUpperCase() && !invalidSnakeSeparatorPattern.test(core),
  camelCase: (core) =>
    !startsUpperPattern.test(core) && !separatorPattern.test(core),
  snake_case: (core) =>
    core === core.toLowerCase() && !invalidSnakeSeparatorPattern.test(core),
  strictCamelCase: (core) =>
    !startsUpperPattern.test(core) &&
    !separatorPattern.test(core) &&
    !consecutiveUpperPattern.test(core),
};

/** Whether `name` follows `casing`, ignoring leading and trailing `_` / `$` affixes. */
export const isCase = (name: string, casing: Casing): boolean => {
  const { core } = splitAffixes(name);

  return core.length === 0 || matchers[casing](core);
};

/**
 * Converts `name` to `casing`, preserving leading and trailing `_` / `$` affixes.
 *
 * The result is not guaranteed to satisfy {@link isCase} (single-letter words such as in
 * `foo_a_bar` → `fooABar` violate the strict formats), so check it before using it as a fix.
 */
export const toCase = (name: string, casing: Casing): string => {
  const { prefix, core, suffix } = splitAffixes(name);
  const words = splitWords(core);

  if (words.length === 0) {
    return name;
  }

  return `${prefix}${joiners[casing](words)}${suffix}`;
};
