export const CARD_TEXT_SECTION_KEYS = [
  "aliases",
  "ancestors",
  "sourceTypes",
  "targetTypes",
  "constraints",
  "examples",
] as const;

export type CardTextSectionKey = (typeof CARD_TEXT_SECTION_KEYS)[number];

export interface StructuredCardText {
  kind: "structured";
  original: string;
  relation: string;
  description: string;
  inverseName: string;
  slug: string;
  sections: Record<CardTextSectionKey, string[]>;
}

export interface RawCardText {
  kind: "raw";
  original: string;
}

export type ParsedCardText = StructuredCardText | RawCardText;

const SECTION_KEY_BY_HEADING: Readonly<Record<string, CardTextSectionKey>> = {
  "Aliases:": "aliases",
  "Ancestors:": "ancestors",
  "Source types:": "sourceTypes",
  "Target types:": "targetTypes",
  "Constraints:": "constraints",
  "Examples:": "examples",
};

const CARD_TEXT_PART_ORDER = {
  relation: 0,
  description: 1,
  aliases: 2,
  inverseName: 3,
  ancestors: 4,
  sourceTypes: 5,
  targetTypes: 6,
  constraints: 7,
  examples: 8,
  slug: 9,
} as const satisfies Readonly<
  Record<
    CardTextSectionKey | "description" | "inverseName" | "relation" | "slug",
    number
  >
>;

const STRUCTURED_FIELD_PREFIXES = [
  "Description:",
  "Inverse Name:",
  "Slug:",
] as const;

const emptySections = (): Record<CardTextSectionKey, string[]> => ({
  aliases: [],
  ancestors: [],
  sourceTypes: [],
  targetTypes: [],
  constraints: [],
  examples: [],
});

const fieldValue = (line: string, prefix: string): string | null =>
  line.startsWith(prefix) ? line.slice(prefix.length).trim() : null;

const rawCardText = (cardText: string): RawCardText => ({
  kind: "raw",
  original: cardText,
});

export const parseCardText = (cardText: string): ParsedCardText => {
  const sections = emptySections();
  const seenParts = new Set<keyof typeof CARD_TEXT_PART_ORDER>();
  let relation: string | null = null;
  let description: string | null = null;
  let inverseName: string | null = null;
  let slug: string | null = null;
  let activeSection: CardTextSectionKey | null = null;
  let previousPartOrder = -1;

  const beginPart = (part: keyof typeof CARD_TEXT_PART_ORDER): boolean => {
    const partOrder = CARD_TEXT_PART_ORDER[part];
    if (seenParts.has(part) || partOrder <= previousPartOrder) {
      return false;
    }
    seenParts.add(part);
    previousPartOrder = partOrder;
    return true;
  };

  for (const rawLine of cardText.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (line === "") {
      continue;
    }

    const relationValue = fieldValue(line, "Relation:");
    if (relationValue !== null) {
      if (!relationValue || !beginPart("relation")) {
        return rawCardText(cardText);
      }
      relation = relationValue;
      activeSection = null;
      continue;
    }

    const descriptionValue = fieldValue(line, "Description:");
    if (descriptionValue !== null) {
      if (!descriptionValue || !beginPart("description")) {
        return rawCardText(cardText);
      }
      description = descriptionValue;
      activeSection = null;
      continue;
    }

    const inverseValue = fieldValue(line, "Inverse Name:");
    if (inverseValue !== null) {
      if (!inverseValue || !beginPart("inverseName")) {
        return rawCardText(cardText);
      }
      inverseName = inverseValue;
      activeSection = null;
      continue;
    }

    const slugValue = fieldValue(line, "Slug:");
    if (slugValue !== null) {
      if (!slugValue || !beginPart("slug")) {
        return rawCardText(cardText);
      }
      slug = slugValue;
      activeSection = null;
      continue;
    }

    const sectionKey = SECTION_KEY_BY_HEADING[line];
    if (sectionKey) {
      if (!beginPart(sectionKey)) {
        return rawCardText(cardText);
      }
      activeSection = sectionKey;
      continue;
    }

    if (activeSection && /^\s*-\s+\S/u.test(rawLine)) {
      sections[activeSection].push(rawLine.replace(/^\s*-\s+/u, ""));
      continue;
    }

    return rawCardText(cardText);
  }

  if (
    relation === null ||
    description === null ||
    inverseName === null ||
    slug === null ||
    !seenParts.has("constraints") ||
    sections.constraints.length === 0 ||
    [...seenParts]
      .filter((part) =>
        CARD_TEXT_SECTION_KEYS.includes(part as CardTextSectionKey),
      )
      .some((part) => sections[part as CardTextSectionKey].length === 0)
  ) {
    return rawCardText(cardText);
  }

  return {
    kind: "structured",
    original: cardText,
    relation,
    description,
    inverseName,
    slug,
    sections,
  };
};

export const reassembleCardText = (parsedCardText: ParsedCardText): string =>
  parsedCardText.original;

export const verifyCardTextRoundTrips = (
  cardTexts: readonly string[],
): string[] =>
  cardTexts.flatMap((cardText, cardIndex) =>
    reassembleCardText(parseCardText(cardText)) === cardText
      ? []
      : [`Card ${cardIndex + 1} changed during parse/reassembly.`],
  );

const hasStructuredCardMarkers = (lines: readonly string[]): boolean =>
  lines.some((line) => {
    const trimmedLine = line.trim();
    return (
      trimmedLine in SECTION_KEY_BY_HEADING ||
      STRUCTURED_FIELD_PREFIXES.some((prefix) => trimmedLine.startsWith(prefix))
    );
  });

export const shufflableExampleLineIndexes = (
  cardText: string,
): { lines: string[]; indexes: number[] } => {
  const lines = cardText.split(/\r?\n/u);
  const examplesHeadingIndex = lines.findIndex(
    (line) => line.trim() === "Examples:",
  );

  if (examplesHeadingIndex >= 0) {
    const indexes: number[] = [];
    for (
      let lineIndex = examplesHeadingIndex + 1;
      lineIndex < lines.length;
      lineIndex += 1
    ) {
      const line = lines[lineIndex];
      if (!line || !/^\s*-\s+/u.test(line)) {
        break;
      }
      indexes.push(lineIndex);
    }
    return { lines, indexes };
  }

  if (hasStructuredCardMarkers(lines)) {
    return { lines, indexes: [] };
  }

  return {
    lines,
    indexes: lines
      .map((line, lineIndex) => ({ line, lineIndex }))
      .filter(({ line, lineIndex }) => lineIndex > 0 && line.trim() !== "")
      .map(({ lineIndex }) => lineIndex),
  };
};
