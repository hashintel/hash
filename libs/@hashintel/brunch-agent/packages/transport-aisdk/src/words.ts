/** Bounds on the preferred-spelling snapshot a contextual user message carries. */
export const petrinautWordSpellingLimits = {
  count: 50,
  length: 80,
  totalLength: 1_000,
} as const;

/** Normalize one bounded, untrusted single-line literal. */
export const normalizePetrinautWordLiteral = (
  value: unknown,
  maximum: number,
): string => {
  const literalError =
    "Words must be plain single-line text without control characters or angle brackets.";
  if (typeof value !== "string") throw new Error(literalError);
  // One quantifier-free character class, so matching is linear in the input.
  // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/u.test(value)) {
    throw new Error(literalError);
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized || Array.from(normalized).length > maximum) {
    throw new Error(`Use between 1 and ${maximum} characters.`);
  }
  return normalized;
};

export const validatePetrinautWordSpellings = (
  input: unknown,
): readonly string[] => {
  if (
    !Array.isArray(input) ||
    input.length > petrinautWordSpellingLimits.count
  ) {
    throw new Error(`Use at most ${petrinautWordSpellingLimits.count} words.`);
  }
  const seen = new Set<string>();
  let total = 0;
  return input.map((entry: unknown) => {
    const spelling = normalizePetrinautWordLiteral(
      entry,
      petrinautWordSpellingLimits.length,
    );
    const key = spelling.toLowerCase();
    if (seen.has(key)) throw new Error("This word is already in the list.");
    seen.add(key);
    total += Array.from(spelling).length;
    if (total > petrinautWordSpellingLimits.totalLength) {
      throw new Error("Use at most 1,000 spelling characters in total.");
    }
    return spelling;
  });
};
