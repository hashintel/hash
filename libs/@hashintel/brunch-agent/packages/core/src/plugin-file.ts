/**
 * The plugin file — one sectioned Markdown document per target formalism
 * (ADR-0006; `docs/specs/plugin-contract.md`).
 *
 * The harness reads three tables by machine: `## Kinds` is the closed node-kind
 * catalog, `## Must know` is the demand list (one row per kind and slot, plus
 * the static floor stated in prose beneath it), and `## Patterns` is the
 * kind-indexed pattern index. Every section's prose, including the sections
 * around those tables, is kept verbatim so the binding can hand it to the
 * interviewer as instructions. The parser is strict: a missing, renamed, or
 * reordered contract heading, an unknown column, an unknown precision word, or
 * a demand row for a kind the catalog lacks makes the file fail to load rather
 * than load with a hole.
 *
 * Nothing here knows a domain or a formalism. The SDCPN file is the exemplar
 * the column and value vocabularies were fixed against; a second file that
 * needs a new heading is a finding for ADR-0006, not a parser feature.
 */

export const PLUGIN_FILE_HEADINGS = [
  "Purpose",
  "Kinds",
  "Must know",
  "Patterns",
  "Moves",
  "Deliverable",
] as const;

export type PluginFileHeading = (typeof PLUGIN_FILE_HEADINGS)[number];

/** Precision words a value can carry. `at least N` is a count, not a word. */
export const PRECISION_WORDS = [
  "named",
  "number",
  "range",
  "spread",
  "spelled out",
] as const;

export type PrecisionWord = (typeof PRECISION_WORDS)[number];

export type PrecisionDemand =
  | { readonly kind: "word"; readonly word: PrecisionWord }
  | { readonly kind: "at-least"; readonly count: number };

export interface KindRow {
  readonly kind: string;
  readonly description: string;
  readonly projectsTo: string;
}

export interface MustKnowRow {
  readonly kind: string;
  readonly slot: string;
  readonly precision: PrecisionDemand;
  readonly notApplicableAllowed: boolean;
  readonly why: string;
}

export interface FloorRow {
  readonly kind: string;
  readonly atLeast: number;
}

export interface PatternRow {
  readonly id: string;
  readonly when: string;
  readonly ask: string;
  /** Kinds named in `when`; the mechanical half of the trigger. */
  readonly kinds: readonly string[];
}

export interface PluginFile {
  /** Immutable version string from the header, e.g. `sdcpn/2026-08-25.1`. */
  readonly version: string;
  readonly kinds: readonly KindRow[];
  readonly mustKnow: readonly MustKnowRow[];
  readonly floor: readonly FloorRow[];
  readonly patterns: readonly PatternRow[];
  /** Each section's Markdown body, heading line excluded, in contract order. */
  readonly sections: Readonly<Record<PluginFileHeading, string>>;
}

export class PluginFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginFileError";
  }
}

const KINDS_COLUMNS = ["#", "kind", "what it is", "projects to"] as const;
const MUST_KNOW_COLUMNS = [
  "kind",
  "slot",
  "precision",
  '"not applicable" allowed',
  "why the model needs it",
] as const;
const PATTERNS_COLUMNS = ["id", "when", "ask"] as const;

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const stripCode = (cell: string): string => cell.replace(/^`(.*)`$/u, "$1");

interface Table {
  readonly header: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

/**
 * The first GFM table in a block of Markdown: a header line, a separator line,
 * then body rows, all starting with `|`. Cells split on bare `|`, which is exact
 * for the exemplar and would need revisiting only for an escaped `\|`.
 */
const firstTable = (markdown: string, where: string): Table => {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.trimStart().startsWith("|"));
  if (start === -1) {
    throw new PluginFileError(`\`## ${where}\` has no table.`);
  }
  const tableLines: string[] = [];
  for (const line of lines.slice(start)) {
    if (!line.trimStart().startsWith("|")) break;
    tableLines.push(line.trim());
  }
  const [headerLine, separator, ...bodyLines] = tableLines;
  if (
    headerLine === undefined ||
    separator === undefined ||
    !/^\|(?:\s*:?-+:?\s*\|)+$/u.test(separator)
  ) {
    throw new PluginFileError(
      `\`## ${where}\`: the first table lacks a header and separator row.`,
    );
  }
  const splitCells = (line: string): string[] =>
    line
      .replace(/^\|/u, "")
      .replace(/\|$/u, "")
      .split("|")
      .map((cell) => cell.trim());
  const header = splitCells(headerLine);
  const rows = bodyLines.map((line, index) => {
    const cells = splitCells(line);
    if (cells.length !== header.length) {
      throw new PluginFileError(
        `\`## ${where}\` row ${index + 1} has ${cells.length} cells; the header has ${header.length}.`,
      );
    }
    return cells;
  });
  return { header, rows };
};

const expectColumns = (
  table: Table,
  expected: readonly string[],
  where: string,
): void => {
  if (
    table.header.length !== expected.length ||
    table.header.some((column, index) => column !== expected[index])
  ) {
    throw new PluginFileError(
      `\`## ${where}\` columns must be exactly [${expected.join(", ")}]; found [${table.header.join(", ")}].`,
    );
  }
};

const parsePrecision = (cell: string, where: string): PrecisionDemand => {
  const atLeast = /^at least (\d+)$/u.exec(cell);
  if (atLeast) {
    return { kind: "at-least", count: Number(atLeast[1]) };
  }
  const word = PRECISION_WORDS.find((candidate) => candidate === cell);
  if (word === undefined) {
    throw new PluginFileError(
      `${where}: precision \`${cell}\` is not one of ${PRECISION_WORDS.map((candidate) => `\`${candidate}\``).join(", ")} or \`at least N\`.`,
    );
  }
  return { kind: "word", word };
};

const parseYesNo = (cell: string, where: string): boolean => {
  if (cell === "yes") return true;
  if (cell === "no") return false;
  throw new PluginFileError(
    `${where}: expected \`yes\` or \`no\`, found \`${cell}\`.`,
  );
};

const parseSections = (
  markdown: string,
): { header: string; sections: Record<PluginFileHeading, string> } => {
  const lines = markdown.split("\n");
  const headings: Array<{ title: string; line: number }> = [];
  let inFence = false;
  for (const [index, line] of lines.entries()) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const match = /^## (.+?)\s*$/u.exec(line);
    if (match) headings.push({ title: match[1]!, line: index });
  }
  const found = headings.map((heading) => heading.title);
  if (
    found.length !== PLUGIN_FILE_HEADINGS.length ||
    found.some((title, index) => title !== PLUGIN_FILE_HEADINGS[index])
  ) {
    throw new PluginFileError(
      `Contract headings must be exactly [${PLUGIN_FILE_HEADINGS.join(" · ")}] in that order; found [${found.join(" · ")}].`,
    );
  }
  const header = lines.slice(0, headings[0]!.line).join("\n");
  const sections = Object.fromEntries(
    headings.map((heading, index) => {
      const end = headings[index + 1]?.line ?? lines.length;
      return [
        heading.title,
        lines
          .slice(heading.line + 1, end)
          .join("\n")
          .trim(),
      ];
    }),
  ) as Record<PluginFileHeading, string>;
  return { header, sections };
};

const parseFloor = (
  mustKnowSection: string,
  kinds: ReadonlySet<string>,
): FloorRow[] => {
  const paragraph = mustKnowSection
    .split(/\n\s*\n/u)
    .find((block) => /^\s*Static floor\b/u.test(block));
  if (paragraph === undefined) {
    throw new PluginFileError(
      "`## Must know` must state the static floor in a paragraph beginning `Static floor`.",
    );
  }
  const floor: FloorRow[] = [];
  for (const match of paragraph.matchAll(
    /at least (one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+`([^`]+)`/gu,
  )) {
    const count = NUMBER_WORDS[match[1]!] ?? Number(match[1]);
    const kind = match[2]!;
    if (!kinds.has(kind)) {
      throw new PluginFileError(
        `Static floor names \`${kind}\`, which is not in \`## Kinds\`.`,
      );
    }
    floor.push({ kind, atLeast: count });
  }
  if (floor.length === 0) {
    throw new PluginFileError(
      "Static floor names no kind; expected phrases like `at least one `objective``.",
    );
  }
  return floor;
};

/** Parse one plugin file. Throws `PluginFileError` when the contract is violated. */
export function parsePluginFile(markdown: string): PluginFile {
  const { header, sections } = parseSections(markdown);

  const version = /Version:\s*`([^`]+)`/u.exec(header)?.[1];
  if (version === undefined) {
    throw new PluginFileError(
      "The header must declare an immutable version as `Version: `<formalism>/<date>.<n>``.",
    );
  }

  const kindsTable = firstTable(sections.Kinds, "Kinds");
  expectColumns(kindsTable, KINDS_COLUMNS, "Kinds");
  const kinds: KindRow[] = kindsTable.rows.map((cells) => ({
    kind: stripCode(cells[1]!),
    description: cells[2]!,
    projectsTo: cells[3]!,
  }));
  const kindNames = new Set<string>();
  for (const row of kinds) {
    if (row.kind === "" || kindNames.has(row.kind)) {
      throw new PluginFileError(
        `\`## Kinds\` has an empty or repeated kind: \`${row.kind}\`.`,
      );
    }
    kindNames.add(row.kind);
  }

  const mustKnowTable = firstTable(sections["Must know"], "Must know");
  expectColumns(mustKnowTable, MUST_KNOW_COLUMNS, "Must know");
  const slotKeys = new Set<string>();
  const mustKnow: MustKnowRow[] = mustKnowTable.rows.map((cells, index) => {
    const where = `\`## Must know\` row ${index + 1}`;
    const kind = stripCode(cells[0]!);
    const slot = cells[1]!;
    if (!kindNames.has(kind)) {
      throw new PluginFileError(
        `${where} names \`${kind}\`, which is not in \`## Kinds\`.`,
      );
    }
    if (slot === "") {
      throw new PluginFileError(`${where} has an empty slot.`);
    }
    const key = `${kind} ${slot}`;
    if (slotKeys.has(key)) {
      throw new PluginFileError(
        `${where} repeats the slot \`${slot}\` on \`${kind}\`.`,
      );
    }
    slotKeys.add(key);
    return {
      kind,
      slot,
      precision: parsePrecision(cells[2]!, where),
      notApplicableAllowed: parseYesNo(cells[3]!, where),
      why: cells[4]!,
    };
  });
  for (const kind of kindNames) {
    if (!mustKnow.some((row) => row.kind === kind)) {
      throw new PluginFileError(
        `\`## Must know\` has no row for kind \`${kind}\`; every kind needs at least one.`,
      );
    }
  }

  const floor = parseFloor(sections["Must know"], kindNames);

  const patternsTable = firstTable(sections.Patterns, "Patterns");
  expectColumns(patternsTable, PATTERNS_COLUMNS, "Patterns");
  const patternIds = new Set<string>();
  const patterns: PatternRow[] = patternsTable.rows.map((cells, index) => {
    const id = cells[0]!;
    if (id === "" || patternIds.has(id)) {
      throw new PluginFileError(
        `\`## Patterns\` row ${index + 1} has an empty or repeated id: \`${id}\`.`,
      );
    }
    patternIds.add(id);
    const when = cells[1]!;
    const named = [...when.matchAll(/`([^`]+)`/gu)].map((match) => match[1]!);
    return {
      id,
      when,
      ask: cells[2]!,
      kinds: [...new Set(named.filter((name) => kindNames.has(name)))],
    };
  });

  return { version, kinds, mustKnow, floor, patterns, sections };
}

/** Every section, in contract order, as one instruction document. */
export const pluginFileInstructions = (file: PluginFile): string =>
  PLUGIN_FILE_HEADINGS.map(
    (heading) => `## ${heading}\n\n${file.sections[heading]}`,
  ).join("\n\n");

/** The demand rows for one kind, in file order. */
export const mustKnowRowsFor = (
  file: PluginFile,
  kind: string,
): readonly MustKnowRow[] => file.mustKnow.filter((row) => row.kind === kind);
