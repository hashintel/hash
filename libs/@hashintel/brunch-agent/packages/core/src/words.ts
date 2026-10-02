/** Bounded, untrusted vocabulary data shared by the browser and Brunch. */
export type BrunchWord = Readonly<{ spelling: string; pronunciation?: string }>;

export const maxWords = 50;

const literal = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}<>]/u.test(value)
  ) {
    throw new Error(
      "Words must be plain single-line text without control characters or angle brackets.",
    );
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (!normalized || Array.from(normalized).length > maximum) {
    throw new Error(`Use between 1 and ${maximum} characters.`);
  }
  return normalized;
};

export const validateWords = (input: unknown): readonly BrunchWord[] => {
  if (!Array.isArray(input) || input.length > maxWords) {
    throw new Error(`Use at most ${maxWords} words.`);
  }
  const seen = new Set<string>();
  let total = 0;
  return input.map((entry: unknown) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      Array.isArray(entry) ||
      !("spelling" in entry) ||
      Object.keys(entry).some(
        (key) => key !== "spelling" && key !== "pronunciation",
      )
    ) {
      throw new Error("Invalid word entry.");
    }
    const spelling = literal(entry.spelling, 80);
    const key = spelling.toLowerCase();
    if (seen.has(key)) throw new Error("This word is already in the list.");
    seen.add(key);
    total += Array.from(spelling).length;
    if (total > 1_000)
      throw new Error("Use at most 1,000 spelling characters in total.");
    return {
      spelling,
      ...("pronunciation" in entry
        ? { pronunciation: literal(entry.pronunciation, 120) }
        : {}),
    };
  });
};

export const validateSpellings = (input: unknown): readonly string[] => {
  if (!Array.isArray(input)) throw new Error("Invalid spellings.");
  return validateWords(input.map((spelling: unknown) => ({ spelling }))).map(
    (word) => word.spelling,
  );
};
