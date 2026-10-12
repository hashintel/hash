/**
 * Detects affixes that restate what kind of declaration a name refers to, as in Java and C#
 * (`IUser`, `EColor`, `UserI`), or that it describes the structure of a value (`UserShape`).
 */

export interface KindAffixMatch {
  readonly affix: string;
  readonly position: "prefix" | "suffix";
  /** The name without the affix. */
  readonly expected: string;
}

interface KindAffix {
  readonly affix: string;
  readonly position: "prefix" | "suffix";
  /** Matches a name carrying the affix. Replacing the match with `replacement` drops it. */
  readonly pattern: RegExp;
  readonly replacement: string;
}

// A prefix only counts before a capitalized word. This excludes acronyms (`IOError`, `ETL`)
// and words that start with the letter (`IPv4`, `IFrame`, `ETag`).
const kindAffixes: readonly KindAffix[] = [
  {
    affix: "I",
    pattern: /^(?<lead>[$_]*)I(?!Pv[46]|Frame(?!\p{Ll}))(?=\p{Lu}\p{Ll})/u,
    position: "prefix",
    replacement: "$<lead>",
  },
  {
    affix: "E",
    pattern: /^(?<lead>[$_]*)E(?!Tag(?!\p{Ll}))(?=\p{Lu}\p{Ll})/u,
    position: "prefix",
    replacement: "$<lead>",
  },
  {
    affix: "I",
    pattern: /^(?<stem>[$_]*\p{Lu}.*[\p{Ll}\p{N}])I(?<trail>[$_]*)$/u,
    position: "suffix",
    replacement: "$<stem>$<trail>",
  },
  {
    affix: "Shape",
    pattern: /^(?<stem>.*[\p{Ll}\p{N}])Shape(?<trail>[$_]*)$/u,
    position: "suffix",
    replacement: "$<stem>$<trail>",
  },
];

/** The first kind affix `name` carries, or `null` if it carries none. */
export const findKindAffix = (name: string): KindAffixMatch | null => {
  for (const { affix, pattern, position, replacement } of kindAffixes) {
    const expected = name.replace(pattern, replacement);

    if (expected !== name) {
      return { affix, expected, position };
    }
  }

  return null;
};
