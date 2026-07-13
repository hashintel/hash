import { shufflableExampleLineIndexes } from "./card-text.ts";
import {
  ADJUDICATION_SCHEMA_VERSION,
  AnnotatorIdSchema,
  CardSchema,
  ImportedAdjudicationRecordSchema,
  ImportedSwipeRecordSchema,
  LABELS,
  LabelSchema,
  QualificationCardSchema,
  SCHEMA_VERSION,
  StudySchema,
  SWIPE_SCHEMA_VERSION,
  WikidataCardRecordSchema,
  formatZodIssues,
  type AdjudicationDecision,
  type Card,
  type CodeSheetEntry,
  type CreatedAdjudicationRecord,
  type ImportedAdjudicationRecord,
  type ImportedSwipeRecord,
  type InternalEvent,
  type Label,
  type MonotoneTimestamp,
  type Prescreen,
  type QualificationCard,
  type RetractionEvent,
  type Study,
  type StudyManifest,
  type StudySampling,
  type SwipeEvent,
  type SwipeRecord,
} from "./data-contracts.ts";

export * from "./data-contracts.ts";
export * from "./card-text.ts";

export type LabelDirection = "up" | "right" | "left" | "down";

export interface LabelDetail {
  readonly name: string;
  readonly subtitle: string;
  readonly direction: LabelDirection;
  readonly arrow: string;
  readonly description: string;
}

export const LABEL_DETAILS = Object.freeze({
  C: {
    name: "Same dot",
    subtitle: "like duplicate of",
    direction: "up",
    arrow: "↑",
    description: "They are the same thing, recorded twice.",
  },
  P: {
    name: "Nearby",
    subtitle: "like part of",
    direction: "right",
    arrow: "→",
    description:
      "Different things, but exploring around one, you would be surprised not to find the other.",
  },
  O: {
    name: "Just a line",
    subtitle: "like author",
    direction: "left",
    arrow: "←",
    description:
      "Genuinely connected, but the connection says nothing about where either belongs.",
  },
  U: {
    name: "Can't tell",
    subtitle: "genuinely torn — a real answer",
    direction: "down",
    arrow: "↓",
    description: "Genuinely torn. A real answer, not a failure.",
  },
} satisfies Readonly<Record<Label, LabelDetail>>);

export interface AssignmentOptions {
  cards: readonly Card[];
  annotatorIds: readonly string[];
  coverageTarget: number;
  sliceSize: number;
  seed: unknown;
}

export type GenerateAssignmentsOptions = AssignmentOptions;

export interface AssignmentResult {
  assignments: Record<string, string[]>;
  loads: Record<string, number>;
  stratum_loads: Record<Prescreen, Record<string, number>>;
}

export interface CreateStudyOptions {
  cards: Card[];
  qualificationCards?: QualificationCard[];
  annotatorIds: string[];
  seed: unknown;
  coverageTarget?: number;
  sliceSize?: number;
  rubricVersion?: string;
  title?: string;
  sampling?: StudySampling;
}

export interface CreateStudyResult {
  study: Study;
  codeSheet: CodeSheetEntry[];
}

export interface RelationSwipeRecord {
  relation_id: string;
  annotator_id: string;
  label: Label;
  pass: number;
  swipe_id?: string;
  ts?: string;
  retracted?: boolean;
  qualification?: boolean;
  note?: unknown;
  study_id?: string;
  deck_hash?: string;
  card_hash?: string;
}

export interface LatestVoteRecord extends RelationSwipeRecord {
  swipe_id: string;
  ts: string;
}

export interface ProjectedSwipeRecord extends SwipeRecord {
  retracted: boolean;
  retracted_at?: string;
}

export interface ProductionDeckOptions {
  study: Study;
  annotatorId: string;
  pass: number;
  events?: readonly InternalEvent[];
}

export interface QualificationDeckOptions {
  study: Study;
  annotatorId: string;
  events?: readonly InternalEvent[];
}

export interface CreateSwipeEventOptions {
  study: Study;
  annotatorId: string;
  card: Card;
  pass: number;
  label: Label;
  latencyMs: number;
  flagged: boolean;
  note?: string | null;
  rubricVersion: string;
  qualification: boolean;
  sessionId: string;
  sequence: number;
  timestamp: MonotoneTimestamp;
}

export interface CreateRetractionEventOptions {
  swipeId: string;
  annotatorId: string;
  sessionId: string;
  timestamp: MonotoneTimestamp;
}

export interface CreateAdjudicationOptions {
  studyId: string;
  deckHash: string;
  relationId: string;
  cardHash: string;
  label: Label;
  rationale: string;
  adjudicatorId: string;
  timestamp: MonotoneTimestamp;
}

export type LabelCounts = Record<Label, number>;

export interface RelationNote {
  annotator_id: string;
  pass: number;
  note: unknown;
}

export interface RelationSummary {
  relation_id: string;
  card: Card | null;
  swipes: RelationSwipeRecord[];
  labels: Label[];
  counts: LabelCounts;
  entropy: number;
  majority: Label | null;
  unanimous: boolean;
  notes: RelationNote[];
}

export interface AgreementMatrix {
  annotatorIds: string[];
  relationIds: string[];
  units: Array<Array<Label | null>>;
}

export interface AgreementStatistics extends AgreementMatrix {
  overall: number | null;
  by_class: Record<Label, number | null>;
}

export interface AnnotatorGoldAgreement {
  annotator_id: string;
  matching: number;
  total: number;
  agreement: number | null;
}

export interface CoverageRow {
  relation_id: string;
  expected: number;
  observed: number;
}

export interface CoverageSummary {
  rows: CoverageRow[];
  complete: number;
  total: number;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export class SaltValidationError extends Error {
  issues: string[];

  constructor(message: string, issues: string[] = []) {
    super(message);
    this.name = "SaltValidationError";
    this.issues = issues;
  }
}

const isLabel = (value: unknown): value is Label =>
  LabelSchema.safeParse(value).success;

export interface ParseCardsOptions<Qualification extends boolean = boolean> {
  qualification?: Qualification;
}

export type ParsedCard<Qualification extends boolean> =
  Qualification extends true ? QualificationCard : Card;

export const parseCardsJsonl = <Qualification extends boolean = false>(
  text: string,
  options: ParseCardsOptions<Qualification> = {},
): Array<ParsedCard<Qualification>> => {
  const qualification = options.qualification ?? false;
  const issues: string[] = [];
  const cards: Array<Card | QualificationCard> = [];
  const relationIds = new Set<string>();
  const cardHashes = new Set<string>();

  text.split(/\r?\n/u).forEach((line, lineIndex) => {
    if (line.trim() === "") {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch (error) {
      issues.push(
        `Line ${lineIndex + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)}).`,
      );
      return;
    }

    const parsedRecord =
      parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    const isWikidataRecord =
      !qualification &&
      parsedRecord !== null &&
      "pid" in parsedRecord &&
      !("relation_id" in parsedRecord);
    const result = (
      qualification
        ? QualificationCardSchema
        : isWikidataRecord
          ? WikidataCardRecordSchema
          : CardSchema
    ).safeParse(parsed);
    if (!result.success) {
      const schemaIssues =
        parsedRecord === null
          ? ["expected a JSON object."]
          : formatZodIssues(result.error);
      issues.push(
        ...schemaIssues.map((issue) => `Line ${lineIndex + 1}: ${issue}`),
      );
      return;
    }
    const card = result.data;
    if (relationIds.has(card.relation_id)) {
      issues.push(
        `Line ${lineIndex + 1}: duplicate relation_id "${card.relation_id}".`,
      );
    }
    relationIds.add(card.relation_id);
    if (cardHashes.has(card.card_hash)) {
      issues.push(
        `Line ${lineIndex + 1}: duplicate card_hash "${card.card_hash}".`,
      );
    }
    cardHashes.add(card.card_hash);
    cards.push(card);
  });

  if (cards.length === 0) {
    issues.push("The file contains no cards.");
  }
  if (issues.length > 0) {
    throw new SaltValidationError("Card import failed.", issues);
  }
  return cards as Array<ParsedCard<Qualification>>;
};

export const cardsToJsonl = (
  cards: readonly (Card | QualificationCard)[],
): string => `${cards.map((card) => JSON.stringify(card)).join("\n")}\n`;

export const parseRoster = (text: string): string[] => {
  const ids = text
    .split(/\r?\n|,/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);

  if (ids.length === 0) {
    throw new SaltValidationError("Add at least one annotator ID.");
  }
  if (duplicates.length > 0) {
    throw new SaltValidationError(
      `Annotator IDs must be unique: ${[...new Set(duplicates)].join(", ")}.`,
    );
  }
  const invalidIds = ids.filter(
    (annotatorId) => !AnnotatorIdSchema.safeParse(annotatorId).success,
  );
  if (invalidIds.length > 0) {
    throw new SaltValidationError(
      `Annotator IDs may contain only letters, numbers, periods, underscores, and hyphens (maximum 64 characters): ${invalidIds.join(", ")}.`,
    );
  }
  return ids;
};

export const stableStringify = (value: unknown): string | undefined => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

const rotateRight = (value: number, amount: number): number =>
  (value >>> amount) | (value << (32 - amount));

const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export const sha256Hex = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const paddedView = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  paddedView.setUint32(paddedLength - 8, Math.floor(bitLength / 2 ** 32));
  paddedView.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let wordIndex = 0; wordIndex < 16; wordIndex += 1) {
      words[wordIndex] = paddedView.getUint32(offset + wordIndex * 4);
    }
    for (let wordIndex = 16; wordIndex < 64; wordIndex += 1) {
      const word15 = words[wordIndex - 15];
      const word2 = words[wordIndex - 2];
      const sigma0 =
        rotateRight(word15, 7) ^ rotateRight(word15, 18) ^ (word15 >>> 3);
      const sigma1 =
        rotateRight(word2, 17) ^ rotateRight(word2, 19) ^ (word2 >>> 10);
      words[wordIndex] =
        (words[wordIndex - 16] + sigma0 + words[wordIndex - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let round = 0; round < 64; round += 1) {
      const choice = (e & f) ^ (~e & g);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const bigSigma0 =
        rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const bigSigma1 =
        rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const first =
        (h + bigSigma1 + choice + SHA256_CONSTANTS[round] + words[round]) >>> 0;
      const second = (bigSigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((part) => part.toString(16).padStart(8, "0")).join("");
};

export const deriveSeed = (seed: unknown, ...parts: unknown[]): number =>
  Number.parseInt(
    sha256Hex([String(seed), ...parts.map(String)].join("\u001f")).slice(0, 8),
    16,
  ) >>> 0;

export const createRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };
};

export const shuffled = <Value>(
  values: readonly Value[],
  seed: number,
): Value[] => {
  const result = [...values];
  const random = createRandom(seed);
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

export const shuffleCardText = (cardText: string, seed: number): string => {
  const { lines, indexes } = shufflableExampleLineIndexes(cardText);
  if (indexes.length < 2) {
    return cardText;
  }
  const randomizedExamples = shuffled(
    indexes.map((lineIndex) => lines[lineIndex]!),
    seed,
  );
  const randomizedLines = [...lines];
  indexes.forEach((lineIndex, exampleIndex) => {
    randomizedLines[lineIndex] = randomizedExamples[exampleIndex]!;
  });
  return randomizedLines.join("\n");
};

const compareAssignmentCandidates = (
  left: string,
  right: string,
  totalLoads: ReadonlyMap<string, number>,
  stratumLoads: ReadonlyMap<string, number>,
  tieBreakers: ReadonlyMap<string, number>,
): number =>
  totalLoads.get(left)! - totalLoads.get(right)! ||
  stratumLoads.get(left)! - stratumLoads.get(right)! ||
  tieBreakers.get(left)! - tieBreakers.get(right)! ||
  left.localeCompare(right);

export const generateAssignments = ({
  cards,
  annotatorIds,
  coverageTarget,
  sliceSize,
  seed,
}: AssignmentOptions): AssignmentResult => {
  if (!Number.isInteger(coverageTarget) || coverageTarget < 1) {
    throw new SaltValidationError(
      "Coverage target must be a positive integer.",
    );
  }
  if (coverageTarget > annotatorIds.length) {
    throw new SaltValidationError(
      `Coverage ${coverageTarget} requires at least ${coverageTarget} annotators.`,
    );
  }
  if (!Number.isInteger(sliceSize) || sliceSize < 1) {
    throw new SaltValidationError("Slice cap must be a positive integer.");
  }

  const minimumLargestSlice = Math.ceil(
    (cards.length * coverageTarget) / annotatorIds.length,
  );
  if (minimumLargestSlice > sliceSize) {
    throw new SaltValidationError(
      `The slice cap is too small. This study needs at least ${minimumLargestSlice} cards per annotator for ${coverageTarget}× coverage.`,
    );
  }

  const assignments = new Map<string, string[]>(
    annotatorIds.map((annotatorId) => [annotatorId, []]),
  );
  const totalLoads = new Map<string, number>(
    annotatorIds.map((annotatorId) => [annotatorId, 0]),
  );
  const stratumLoadsByName = new Map<Prescreen, Map<string, number>>();

  for (const stratum of ["equivalence", "normal"] as const) {
    const cardsInStratum = shuffled(
      cards.filter((card) => card.prescreen === stratum),
      deriveSeed(seed, "assignment-card-order", stratum),
    );
    const stratumLoads = new Map<string, number>(
      annotatorIds.map((annotatorId) => [annotatorId, 0]),
    );
    stratumLoadsByName.set(stratum, stratumLoads);

    for (const card of cardsInStratum) {
      const selected = new Set<string>();
      for (let copy = 0; copy < coverageTarget; copy += 1) {
        const tieBreakers = new Map<string, number>(
          annotatorIds.map((annotatorId) => [
            annotatorId,
            deriveSeed(
              seed,
              "assignment-tie",
              stratum,
              card.relation_id,
              copy,
              annotatorId,
            ),
          ]),
        );
        const candidates = annotatorIds
          .filter(
            (annotatorId) =>
              !selected.has(annotatorId) &&
              totalLoads.get(annotatorId)! < sliceSize,
          )
          .sort((left, right) =>
            compareAssignmentCandidates(
              left,
              right,
              totalLoads,
              stratumLoads,
              tieBreakers,
            ),
          );
        const chosen = candidates[0];
        if (!chosen) {
          throw new SaltValidationError(
            `Unable to assign ${card.relation_id} within the configured slice cap.`,
          );
        }
        assignments.get(chosen)!.push(card.relation_id);
        totalLoads.set(chosen, totalLoads.get(chosen)! + 1);
        stratumLoads.set(chosen, stratumLoads.get(chosen)! + 1);
        selected.add(chosen);
      }
    }
  }

  return {
    assignments: Object.fromEntries(
      annotatorIds.map((annotatorId) => [
        annotatorId,
        [...assignments.get(annotatorId)!].sort(),
      ]),
    ),
    loads: Object.fromEntries(totalLoads),
    stratum_loads: Object.fromEntries(
      [...stratumLoadsByName].map(([stratum, loads]) => [
        stratum,
        Object.fromEntries(loads),
      ]),
    ) as Record<Prescreen, Record<string, number>>,
  };
};

const normalizeAccessCode = (value: string): string =>
  value
    .toUpperCase()
    .replace(/[^0-9A-Z]/gu, "")
    .replace(/[ILOU]/gu, "");

const codeChecksum = (body: string): string => {
  let total = 0;
  for (const character of body) {
    total = (total * 33 + CROCKFORD.indexOf(character)) % CROCKFORD.length;
  }
  return CROCKFORD[total];
};

export const createAccessCode = (
  studySeed: unknown,
  annotatorId: string,
): string => {
  const random = createRandom(
    deriveSeed(studySeed, "annotator-access-code", annotatorId),
  );
  let body = "";
  for (let index = 0; index < 7; index += 1) {
    body += CROCKFORD[Math.floor(random() * CROCKFORD.length)];
  }
  const compact = `${body}${codeChecksum(body)}`;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
};

export const isAccessCodeWellFormed = (value: string): boolean => {
  const compact = normalizeAccessCode(value);
  if (compact.length !== 8) {
    return false;
  }
  return codeChecksum(compact.slice(0, 7)) === compact.at(-1);
};

export const accessCodeHash = (studyId: string, code: string): string =>
  sha256Hex(`${studyId}\u001f${normalizeAccessCode(code)}`);

export const createStudy = ({
  cards,
  qualificationCards = [],
  annotatorIds,
  seed,
  coverageTarget = 2,
  sliceSize = 150,
  rubricVersion = "v1",
  title = "SALT geometry adjudication",
  sampling,
}: CreateStudyOptions): CreateStudyResult => {
  if (!Array.isArray(cards) || cards.length === 0) {
    throw new SaltValidationError(
      "A study needs at least one production card.",
    );
  }
  if (!Array.isArray(annotatorIds) || annotatorIds.length === 0) {
    throw new SaltValidationError("A study needs at least one annotator.");
  }
  if (new Set(annotatorIds).size !== annotatorIds.length) {
    throw new SaltValidationError("Annotator IDs must be unique.");
  }
  if (
    annotatorIds.some(
      (annotatorId) =>
        typeof annotatorId !== "string" ||
        !AnnotatorIdSchema.safeParse(annotatorId).success,
    )
  ) {
    throw new SaltValidationError(
      "Annotator IDs may contain only letters, numbers, periods, underscores, and hyphens (maximum 64 characters).",
    );
  }
  if (typeof rubricVersion !== "string" || rubricVersion.trim() === "") {
    throw new SaltValidationError("Rubric version is required.");
  }
  const normalizedSeed = String(seed).trim();
  if (normalizedSeed === "") {
    throw new SaltValidationError("A study seed is required.");
  }
  const deckHash = sha256Hex(stableStringify(cards)!);
  const assignmentResult = generateAssignments({
    cards,
    annotatorIds,
    coverageTarget,
    sliceSize,
    seed: normalizedSeed,
  });
  const studyId = `salt-${sha256Hex(
    stableStringify({
      deckHash,
      qualificationCards,
      seed: normalizedSeed,
      coverageTarget,
      sliceSize,
      assignments: assignmentResult.assignments,
      sampling,
    })!,
  ).slice(0, 12)}`;

  const codeSheet: CodeSheetEntry[] = annotatorIds.map((annotatorId) => {
    const code = createAccessCode(studyId, annotatorId);
    return {
      annotator_id: annotatorId,
      code,
      assigned_cards: assignmentResult.loads[annotatorId],
    };
  });

  const studyResult = StudySchema.safeParse({
    schema_version: SCHEMA_VERSION,
    kind: "study",
    study_id: studyId,
    title: title.trim() || "SALT geometry adjudication",
    deck_hash: deckHash,
    seed: normalizedSeed,
    rubric_version: rubricVersion.trim(),
    coverage_target: coverageTarget,
    slice_size: sliceSize,
    required_production_passes: 1,
    ...(sampling === undefined ? {} : { sampling }),
    cards,
    qualification_cards: qualificationCards,
    manifest: {
      annotator_ids: annotatorIds,
      assignments: assignmentResult.assignments,
      loads: assignmentResult.loads,
      stratum_loads: assignmentResult.stratum_loads,
    },
    access: codeSheet.map(({ annotator_id: annotatorId, code }) => ({
      annotator_id: annotatorId,
      code_hash: accessCodeHash(studyId, code),
    })),
  });
  if (!studyResult.success) {
    throw new SaltValidationError(
      "The generated study is invalid.",
      formatZodIssues(studyResult.error),
    );
  }

  return { study: studyResult.data, codeSheet };
};

export const manifestForExport = (study: Study): StudyManifest => ({
  schema_version: study.schema_version,
  study_id: study.study_id,
  title: study.title,
  deck_hash: study.deck_hash,
  seed: study.seed,
  rubric_version: study.rubric_version,
  coverage_target: study.coverage_target,
  slice_size: study.slice_size,
  required_production_passes: study.required_production_passes,
  ...(study.sampling === undefined ? {} : { sampling: study.sampling }),
  cards: study.cards.map(
    ({ relation_id, family_id, card_hash, prescreen }) => ({
      relation_id,
      family_id,
      card_hash,
      prescreen,
    }),
  ),
  manifest: study.manifest,
});

export const codeSheetToTsv = (
  study: Study,
  codeSheet: readonly CodeSheetEntry[],
): string =>
  [
    "study_id\tannotator_id\tcode\tassigned_cards",
    ...codeSheet.map(
      (entry) =>
        `${study.study_id}\t${entry.annotator_id}\t${entry.code}\t${entry.assigned_cards}`,
    ),
  ].join("\n") + "\n";

export const resolveAnnotatorCode = (
  study: Study,
  code: string,
): string | null => {
  if (!isAccessCodeWellFormed(code)) {
    return null;
  }
  const hash = accessCodeHash(study.study_id, code);
  return (
    study.access.find((entry) => entry.code_hash === hash)?.annotator_id ?? null
  );
};

export const deckSeedFor = (
  study: Study,
  annotatorId: string,
  pass: number,
): number => deriveSeed(study.seed, "production-deck", annotatorId, pass);

export const exampleSeedFor = (
  study: Study,
  annotatorId: string,
  pass: number,
  card: Card,
): number =>
  deriveSeed(study.seed, "card-examples", annotatorId, pass, card.card_hash);

export const qualificationSeedFor = (
  study: Study,
  annotatorId: string,
): number => deriveSeed(study.seed, "qualification-deck", annotatorId);

const isSwipeEvent = (event: InternalEvent): event is SwipeEvent =>
  event.event_type === "swipe";

const isRetractionEvent = (event: InternalEvent): event is RetractionEvent =>
  event.event_type === "retraction";

export const projectSwipes = (
  events: readonly InternalEvent[],
): ProjectedSwipeRecord[] => {
  const retractions = new Map<string, string>(
    events.filter(isRetractionEvent).map((event) => [event.swipe_id, event.ts]),
  );

  return events.filter(isSwipeEvent).map((event) => ({
    ...event.swipe,
    retracted: retractions.has(event.swipe.swipe_id),
    ...(retractions.has(event.swipe.swipe_id)
      ? { retracted_at: retractions.get(event.swipe.swipe_id) }
      : {}),
  }));
};

export interface ActiveSwipesFunction {
  (events: readonly InternalEvent[]): ProjectedSwipeRecord[];
  <Swipe extends RelationSwipeRecord>(swipes: readonly Swipe[]): Swipe[];
}

const activeSwipesImplementation = (
  eventsOrSwipes: readonly InternalEvent[] | readonly RelationSwipeRecord[],
): RelationSwipeRecord[] => {
  const containsInternalEvents = eventsOrSwipes.some((entry) =>
    Boolean((entry as InternalEvent).event_type),
  );
  const swipes: readonly RelationSwipeRecord[] = containsInternalEvents
    ? projectSwipes(eventsOrSwipes as readonly InternalEvent[])
    : (eventsOrSwipes as readonly RelationSwipeRecord[]);
  return swipes.filter((swipe) => !swipe.retracted);
};

export const activeSwipes = activeSwipesImplementation as ActiveSwipesFunction;

export const relationHasLocalDisagreement = (
  events: readonly InternalEvent[],
  relationId: string,
  annotatorId: string,
): boolean => {
  const labels = activeSwipes(events)
    .filter(
      (swipe) =>
        !swipe.qualification &&
        swipe.relation_id === relationId &&
        swipe.annotator_id === annotatorId,
    )
    .map((swipe) => swipe.label);
  return labels.includes("U") || new Set(labels).size > 1;
};

export const getProductionDeck = ({
  study,
  annotatorId,
  pass,
  events = [],
}: ProductionDeckOptions): Card[] => {
  const assignedIds = new Set(study.manifest.assignments[annotatorId] ?? []);
  const completedIds = new Set(
    activeSwipes(events)
      .filter(
        (swipe) =>
          !swipe.qualification &&
          swipe.annotator_id === annotatorId &&
          swipe.pass === pass,
      )
      .map((swipe) => swipe.relation_id),
  );
  const ordered = shuffled(
    study.cards.filter(
      (card) =>
        assignedIds.has(card.relation_id) &&
        (pass < 4 ||
          relationHasLocalDisagreement(events, card.relation_id, annotatorId)),
    ),
    deckSeedFor(study, annotatorId, pass),
  );
  return ordered.filter((card) => !completedIds.has(card.relation_id));
};

export const getQualificationDeck = ({
  study,
  annotatorId,
  events = [],
}: QualificationDeckOptions): QualificationCard[] => {
  const completedIds = new Set(
    activeSwipes(events)
      .filter(
        (swipe) => swipe.qualification && swipe.annotator_id === annotatorId,
      )
      .map((swipe) => swipe.relation_id),
  );
  return shuffled(
    study.qualification_cards,
    qualificationSeedFor(study, annotatorId),
  ).filter((card) => !completedIds.has(card.relation_id));
};

export const nextIncompletePass = (
  study: Study,
  annotatorId: string,
  events: readonly InternalEvent[],
): number => {
  const assignedCount = study.manifest.assignments[annotatorId]?.length ?? 0;
  if (assignedCount === 0) {
    return 1;
  }
  for (let pass = 1; pass < 10_000; pass += 1) {
    const count = activeSwipes(events).filter(
      (swipe) =>
        !swipe.qualification &&
        swipe.annotator_id === annotatorId &&
        swipe.pass === pass,
    ).length;
    if (pass >= 4) {
      const targetedCount = study.cards.filter((card) =>
        relationHasLocalDisagreement(events, card.relation_id, annotatorId),
      ).length;
      if (count < targetedCount) {
        return pass;
      }
    } else if (count < assignedCount) {
      return pass;
    }
  }
  return 1;
};

export const nextMonotoneTimestamp = (
  lastTimestampMs: number = 0,
  now: number = Date.now(),
): MonotoneTimestamp => {
  const timestampMs = Math.max(now, lastTimestampMs + 1);
  return {
    timestampMs,
    iso: new Date(timestampMs).toISOString(),
  };
};

export class DecisionTimer {
  now: () => number;
  startedAt: number | null;
  pausedAt: number | null;
  pausedDuration: number;

  constructor(now: () => number = () => performance.now()) {
    this.now = now;
    this.startedAt = null;
    this.pausedAt = null;
    this.pausedDuration = 0;
  }

  start(): void {
    this.startedAt = this.now();
    this.pausedAt = null;
    this.pausedDuration = 0;
  }

  pause(): void {
    if (this.startedAt !== null && this.pausedAt === null) {
      this.pausedAt = this.now();
    }
  }

  resume(): void {
    if (this.pausedAt !== null) {
      this.pausedDuration += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  elapsed(): number {
    if (this.startedAt === null) {
      return 0;
    }
    const end = this.pausedAt ?? this.now();
    return Math.max(0, Math.round(end - this.startedAt - this.pausedDuration));
  }
}

export const createSwipeEvent = ({
  study,
  annotatorId,
  card,
  pass,
  label,
  latencyMs,
  flagged,
  note,
  rubricVersion,
  qualification,
  sessionId,
  sequence,
  timestamp,
}: CreateSwipeEventOptions): SwipeEvent => {
  if (!isLabel(label)) {
    throw new SaltValidationError(`Unknown label "${label}".`);
  }
  const swipeId = [
    study.study_id,
    annotatorId,
    qualification ? "q" : pass,
    card.relation_id,
    sequence,
    timestamp.timestampMs,
  ].join(":");
  return {
    event_type: "swipe",
    swipe: {
      schema_version: SWIPE_SCHEMA_VERSION,
      swipe_id: swipeId,
      session_id: sessionId,
      study_id: study.study_id,
      deck_hash: study.deck_hash,
      annotator_id: annotatorId,
      relation_id: card.relation_id,
      family_id: card.family_id,
      card_hash: card.card_hash,
      prescreen: card.prescreen,
      pass,
      label,
      latency_ms: Math.max(0, Math.round(latencyMs)),
      flagged: Boolean(flagged),
      note: note?.trim() || null,
      qualification: Boolean(qualification),
      rubric_version: rubricVersion,
      shuffle_seed: qualification
        ? qualificationSeedFor(study, annotatorId)
        : deckSeedFor(study, annotatorId, pass),
      ts: timestamp.iso,
    },
  };
};

export const createRetractionEvent = ({
  swipeId,
  annotatorId,
  sessionId,
  timestamp,
}: CreateRetractionEventOptions): RetractionEvent => ({
  event_type: "retraction",
  swipe_id: swipeId,
  annotator_id: annotatorId,
  session_id: sessionId,
  ts: timestamp.iso,
});

export const latestUndoableSwipe = (
  events: readonly InternalEvent[],
  sessionId: string,
): ProjectedSwipeRecord | null => {
  const projected = projectSwipes(events);
  for (let index = projected.length - 1; index >= 0; index -= 1) {
    const swipe = projected[index];
    if (swipe.session_id === sessionId && !swipe.retracted) {
      return swipe;
    }
  }
  return null;
};

export const swipesToJsonl = (events: readonly InternalEvent[]): string => {
  const swipes = projectSwipes(events);
  return swipes.length === 0
    ? ""
    : `${swipes.map((swipe) => JSON.stringify(swipe)).join("\n")}\n`;
};

export const parseSwipesJsonl = (
  text: string,
  sourceName: string = "swipes.jsonl",
): ImportedSwipeRecord[] => {
  const issues: string[] = [];
  const swipes: ImportedSwipeRecord[] = [];
  text.split(/\r?\n/u).forEach((line, lineIndex) => {
    if (line.trim() === "") {
      return;
    }
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error) {
      issues.push(
        `${sourceName}:${lineIndex + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)}).`,
      );
      return;
    }
    const prefix = `${sourceName}:${lineIndex + 1}`;
    const sourcedRecord =
      record !== null && typeof record === "object" && !Array.isArray(record)
        ? { ...record, source_file: sourceName }
        : record;
    const result = ImportedSwipeRecordSchema.safeParse(sourcedRecord);
    if (!result.success) {
      const schemaIssues =
        sourcedRecord === null ||
        typeof sourcedRecord !== "object" ||
        Array.isArray(sourcedRecord)
          ? ["expected an object."]
          : formatZodIssues(result.error);
      issues.push(...schemaIssues.map((issue) => `${prefix}: ${issue}`));
      return;
    }
    swipes.push(result.data);
  });
  if (issues.length > 0) {
    throw new SaltValidationError(`Could not load ${sourceName}.`, issues);
  }
  return swipes;
};

export const latestVotesByAnnotator = <Swipe extends LatestVoteRecord>(
  swipes: readonly Swipe[],
): Swipe[] => {
  const latest = new Map<string, Swipe>();
  for (const swipe of swipes
    .filter((entry) => !entry.retracted && !entry.qualification)
    .sort(
      (left, right) =>
        left.pass - right.pass ||
        Date.parse(left.ts) - Date.parse(right.ts) ||
        String(left.swipe_id).localeCompare(String(right.swipe_id)),
    )) {
    latest.set(`${swipe.relation_id}\u001f${swipe.annotator_id}`, swipe);
  }
  return [...latest.values()];
};

export const labelCounts = (labels: readonly Label[]): LabelCounts =>
  Object.fromEntries(
    LABELS.map((label) => [
      label,
      labels.filter((candidate) => candidate === label).length,
    ]),
  ) as LabelCounts;

export const shannonEntropy = (labels: readonly Label[]): number => {
  if (labels.length === 0) {
    return 0;
  }
  const counts = labelCounts(labels);
  return LABELS.reduce((total, label) => {
    const probability = counts[label] / labels.length;
    return probability === 0
      ? total
      : total - probability * Math.log2(probability);
  }, 0);
};

export const majorityLabel = (labels: readonly Label[]): Label | null => {
  if (labels.length === 0) {
    return null;
  }
  const counts = labelCounts(labels);
  const largest = Math.max(...Object.values(counts));
  const winners = LABELS.filter((label) => counts[label] === largest);
  return winners.length === 1 ? winners[0] : null;
};

export const relationSummaries = (
  swipes: readonly RelationSwipeRecord[],
  cards: readonly Card[],
): RelationSummary[] => {
  const cardById = new Map<string, Card>(
    cards.map((card) => [card.relation_id, card]),
  );
  const relationIds = new Set<string>([
    ...cards.map((card) => card.relation_id),
    ...swipes.map((swipe) => swipe.relation_id),
  ]);
  return [...relationIds]
    .map((relationId) => {
      const relationSwipes = swipes
        .filter(
          (swipe) =>
            !swipe.retracted &&
            !swipe.qualification &&
            swipe.relation_id === relationId,
        )
        .sort(
          (left, right) =>
            left.annotator_id.localeCompare(right.annotator_id) ||
            left.pass - right.pass,
        );
      const labels = relationSwipes.map((swipe) => swipe.label);
      return {
        relation_id: relationId,
        card: cardById.get(relationId) ?? null,
        swipes: relationSwipes,
        labels,
        counts: labelCounts(labels),
        entropy: shannonEntropy(labels),
        majority: majorityLabel(labels),
        unanimous: labels.length > 0 && new Set(labels).size === 1,
        notes: relationSwipes
          .filter((swipe) => swipe.note)
          .map((swipe) => ({
            annotator_id: swipe.annotator_id,
            pass: swipe.pass,
            note: swipe.note,
          })),
      };
    })
    .sort(
      (left, right) =>
        right.entropy - left.entropy ||
        left.relation_id.localeCompare(right.relation_id),
    );
};

export const nominalKrippendorffAlpha = <Category>(
  units: readonly (readonly (Category | null | undefined)[])[],
): number | null => {
  let observedDisagreement = 0;
  let coincidenceCount = 0;
  const marginals = new Map<Category, number>();

  for (const rawValues of units) {
    const values = rawValues.filter(
      (value): value is Category => value !== null && value !== undefined,
    );
    if (values.length < 2) {
      continue;
    }
    coincidenceCount += values.length;
    for (const value of values) {
      marginals.set(value, (marginals.get(value) ?? 0) + 1);
    }
    let disagreeingOrderedPairs = 0;
    for (let left = 0; left < values.length; left += 1) {
      for (let right = 0; right < values.length; right += 1) {
        if (left !== right && values[left] !== values[right]) {
          disagreeingOrderedPairs += 1;
        }
      }
    }
    observedDisagreement += disagreeingOrderedPairs / (values.length - 1);
  }

  if (coincidenceCount < 2) {
    return null;
  }
  const observed = observedDisagreement / coincidenceCount;
  const sameCategoryPairs = [...marginals.values()].reduce(
    (total, count) => total + count * (count - 1),
    0,
  );
  const expected =
    1 -
    sameCategoryPairs / (coincidenceCount * Math.max(1, coincidenceCount - 1));
  if (expected === 0) {
    return observed === 0 ? 1 : null;
  }
  return 1 - observed / expected;
};

export const agreementMatrix = (
  swipes: readonly LatestVoteRecord[],
): AgreementMatrix => {
  const latest = latestVotesByAnnotator(swipes);
  const annotatorIds = [
    ...new Set(latest.map((swipe) => swipe.annotator_id)),
  ].sort();
  const relationIds = [
    ...new Set(latest.map((swipe) => swipe.relation_id)),
  ].sort();
  const byPair = new Map<string, Label>(
    latest.map((swipe) => [
      `${swipe.relation_id}\u001f${swipe.annotator_id}`,
      swipe.label,
    ]),
  );
  return {
    annotatorIds,
    relationIds,
    units: relationIds.map((relationId) =>
      annotatorIds.map(
        (annotatorId) =>
          byPair.get(`${relationId}\u001f${annotatorId}`) ?? null,
      ),
    ),
  };
};

export const agreementStatistics = (
  swipes: readonly LatestVoteRecord[],
): AgreementStatistics => {
  const matrix = agreementMatrix(swipes);
  return {
    ...matrix,
    overall: nominalKrippendorffAlpha(matrix.units),
    by_class: Object.fromEntries(
      LABELS.map((label) => [
        label,
        nominalKrippendorffAlpha(
          matrix.units.map((unit) =>
            unit.map((value) =>
              value === null ? null : value === label ? label : "other",
            ),
          ),
        ),
      ]),
    ) as Record<Label, number | null>,
  };
};

export const parseAdjudicationsJsonl = (
  text: string,
  sourceName: string = "adjudications.jsonl",
): ImportedAdjudicationRecord[] => {
  const issues: string[] = [];
  const adjudications: ImportedAdjudicationRecord[] = [];
  text.split(/\r?\n/u).forEach((line, lineIndex) => {
    if (line.trim() === "") {
      return;
    }
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch (error) {
      issues.push(
        `${sourceName}:${lineIndex + 1}: invalid JSON (${error instanceof Error ? error.message : String(error)}).`,
      );
      return;
    }
    const prefix = `${sourceName}:${lineIndex + 1}`;
    const result = ImportedAdjudicationRecordSchema.safeParse(record);
    if (!result.success) {
      issues.push(
        ...formatZodIssues(result.error).map((issue) => `${prefix}: ${issue}`),
      );
      return;
    }
    adjudications.push(result.data);
  });
  if (issues.length > 0) {
    throw new SaltValidationError(`Could not load ${sourceName}.`, issues);
  }
  return adjudications;
};

export const adjudicationsToJsonl = (
  adjudications: readonly AdjudicationDecision[],
): string =>
  adjudications.length === 0
    ? ""
    : `${adjudications
        .map((adjudication) => JSON.stringify(adjudication))
        .join("\n")}\n`;

export const createAdjudication = ({
  studyId,
  deckHash,
  relationId,
  cardHash,
  label,
  rationale,
  adjudicatorId,
  timestamp,
}: CreateAdjudicationOptions): CreatedAdjudicationRecord => ({
  schema_version: ADJUDICATION_SCHEMA_VERSION,
  record_type: "adjudication",
  study_id: studyId,
  deck_hash: deckHash,
  relation_id: relationId,
  card_hash: cardHash,
  label,
  rationale: rationale.trim(),
  adjudicator_id: adjudicatorId.trim(),
  ts: timestamp.iso,
});

export const perAnnotatorGoldAgreement = (
  swipes: readonly LatestVoteRecord[],
  adjudications: readonly AdjudicationDecision[],
): AnnotatorGoldAgreement[] => {
  const gold = new Map<string, Label>(
    adjudications.map((record) => [record.relation_id, record.label]),
  );
  const latest = latestVotesByAnnotator(swipes).filter((swipe) =>
    gold.has(swipe.relation_id),
  );
  const grouped = new Map<string, Omit<AnnotatorGoldAgreement, "agreement">>();
  for (const swipe of latest) {
    const current = grouped.get(swipe.annotator_id) ?? {
      annotator_id: swipe.annotator_id,
      matching: 0,
      total: 0,
    };
    current.total += 1;
    current.matching += Number(swipe.label === gold.get(swipe.relation_id));
    grouped.set(swipe.annotator_id, current);
  }
  return [...grouped.values()]
    .map((entry) => ({
      ...entry,
      agreement: entry.total === 0 ? null : entry.matching / entry.total,
    }))
    .sort((left, right) => left.annotator_id.localeCompare(right.annotator_id));
};

const escapeMarkdownCell = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/gu, " ");

export const edgeCaseMarkdown = (
  summaries: readonly RelationSummary[],
  adjudications: readonly AdjudicationDecision[] = [],
): string => {
  const adjudicationById = new Map<string, AdjudicationDecision>(
    adjudications.map((record) => [record.relation_id, record]),
  );
  const lines = [
    "# SALT relation edge cases",
    "",
    "| Relation | Entropy | Labels | Notes | Adjudication | Rationale |",
    "| --- | ---: | --- | --- | --- | --- |",
  ];
  for (const summary of summaries.filter(
    (entry) => entry.entropy > 0 || entry.labels.includes("U"),
  )) {
    const adjudication = adjudicationById.get(summary.relation_id);
    const labelSequence = summary.swipes
      .map((swipe) => `${swipe.annotator_id}/p${swipe.pass}:${swipe.label}`)
      .join(", ");
    const notes = summary.notes
      .map(
        (note) => `${note.annotator_id}/p${note.pass}: ${note.note as string}`,
      )
      .join("; ");
    lines.push(
      `| ${escapeMarkdownCell(summary.relation_id)} | ${summary.entropy.toFixed(
        3,
      )} | ${escapeMarkdownCell(labelSequence)} | ${escapeMarkdownCell(
        notes || "—",
      )} | ${adjudication?.label ?? "—"} | ${escapeMarkdownCell(
        adjudication?.rationale ?? "—",
      )} |`,
    );
  }
  return `${lines.join("\n")}\n`;
};

export const summarizeCoverage = (
  study: Study,
  swipes: readonly LatestVoteRecord[],
): CoverageSummary => {
  const latest = latestVotesByAnnotator(swipes);
  const coveredByRelation = new Map<string, Set<string>>();
  for (const swipe of latest) {
    const annotators =
      coveredByRelation.get(swipe.relation_id) ?? new Set<string>();
    annotators.add(swipe.annotator_id);
    coveredByRelation.set(swipe.relation_id, annotators);
  }
  const rows = study.cards.map((card) => ({
    relation_id: card.relation_id,
    expected: study.coverage_target,
    observed: coveredByRelation.get(card.relation_id)?.size ?? 0,
  }));
  return {
    rows,
    complete: rows.filter((row) => row.observed >= row.expected).length,
    total: rows.length,
  };
};

export const serializePayload = (payload: unknown): string =>
  JSON.stringify(payload)!.replaceAll("<", "\\u003c");

export const safeFilenamePart = (value: unknown): string =>
  String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")
    .slice(0, 80) || "salt";
