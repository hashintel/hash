import * as v from "valibot";

import type { EvidenceSpan, JsonValue } from "./capture-store";

export type SessionEntryKind =
  | "user"
  | "user-affordance-payload"
  | "assistant"
  | "non-user";

export interface SessionLogEntrySnapshot {
  /** Stable identity supplied by the substrate's public projection. */
  readonly substrateEntryId: string;
  /** Harness-owned provenance classification at this read. */
  readonly kind: SessionEntryKind;
  /** Materialized text searched for verbatim evidence quotes. */
  readonly text: string;
  /** Complete public entry, retained independently of the substrate. */
  readonly materialized: JsonValue;
}

export interface SessionLogRead {
  readonly sessionId: string;
  /** Substrate projection identity, distinct from the harness session id. */
  readonly substrateConversationId?: string;
  /** Opaque substrate checkpoint, retained as provenance and never interpreted. */
  readonly offset: string;
  readonly incarnation?: string;
  readonly entries: readonly SessionLogEntrySnapshot[];
  readonly settlements: readonly JsonValue[];
}

export interface ArchivedSessionEntryVersion {
  readonly version: number;
  readonly observedAtOffset: string;
  readonly kind: SessionEntryKind;
  readonly text: string;
  readonly materialized: JsonValue;
}

export interface ArchivedSessionEntry {
  /** Harness-owned, one-based entry identity used by evidence pointers. */
  readonly ordinal: number;
  readonly substrateEntryId: string;
  readonly substrateIncarnation?: string;
  readonly versions: readonly ArchivedSessionEntryVersion[];
}

export interface ArchivedSessionRead {
  readonly offset: string;
  readonly substrateConversationId?: string;
  readonly incarnation?: string;
  readonly entries: readonly {
    readonly ordinal: number;
    readonly version: number;
  }[];
  readonly settlements: readonly JsonValue[];
}

export interface ArchivedSessionLog {
  readonly sessionId: string;
  readonly entries: readonly ArchivedSessionEntry[];
  readonly reads: readonly ArchivedSessionRead[];
}

export interface SessionLogArchive {
  readonly sessions: readonly ArchivedSessionLog[];
}

export interface EvidenceQuote {
  readonly excerpt: string;
  /** Persisted pointer fields are deliberately unassignable to caller input. */
  readonly pointer?: never;
  /** Provenance is derived from the archive, never asserted by the caller. */
  readonly source?: never;
}

export interface MultipleEvidenceMatchesAdvisory {
  readonly type: "multiple-evidence-matches";
  readonly excerpt: string;
  readonly matchCount: number;
  readonly message: string;
}

export type EvidenceResolutionRefusal =
  | {
      readonly code: "evidence-quote-not-found";
      readonly excerpt: string;
      readonly message: string;
    }
  | {
      readonly code: "non-user-evidence";
      readonly excerpt: string;
      readonly message: string;
    };

export type EvidenceResolutionResult =
  | {
      readonly ok: true;
      readonly evidence: readonly EvidenceSpan[];
      readonly advisories: readonly MultipleEvidenceMatchesAdvisory[];
    }
  | { readonly ok: false; readonly refusal: EvidenceResolutionRefusal };

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1));
const kindSchema = v.picklist([
  "user",
  "user-affordance-payload",
  "assistant",
  "non-user",
]);
const versionSchema = v.strictObject({
  version: positiveInteger,
  observedAtOffset: nonEmptyString,
  kind: kindSchema,
  text: v.string(),
  materialized: v.unknown(),
});
const entrySchema = v.strictObject({
  ordinal: positiveInteger,
  substrateEntryId: nonEmptyString,
  substrateIncarnation: v.optional(nonEmptyString),
  versions: v.pipe(v.array(versionSchema), v.minLength(1)),
});
const readSchema = v.strictObject({
  offset: nonEmptyString,
  substrateConversationId: v.optional(nonEmptyString),
  incarnation: v.optional(nonEmptyString),
  entries: v.array(
    v.strictObject({
      ordinal: positiveInteger,
      version: positiveInteger,
    }),
  ),
  settlements: v.array(v.unknown()),
});
const sessionSchema = v.strictObject({
  sessionId: nonEmptyString,
  entries: v.array(entrySchema),
  reads: v.array(readSchema),
});
const archiveSchema = v.strictObject({ sessions: v.array(sessionSchema) });

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return true;
  if (typeof value === "number")
    return Number.isFinite(value) && !Object.is(value, -0);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value as Record<string, unknown>).every(isJsonValue)
  );
};

const canonicalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
};

const canonicalString = (value: JsonValue): string =>
  JSON.stringify(canonicalize(value));

export const createEmptySessionLogArchive = (): SessionLogArchive => ({
  sessions: [],
});

export const parseSessionLogArchive = (input: unknown): SessionLogArchive => {
  const archive = v.parse(archiveSchema, input) as SessionLogArchive;
  const sessionIds = new Set<string>();
  for (const session of archive.sessions) {
    if (sessionIds.has(session.sessionId)) {
      throw new TypeError(`Session log ${session.sessionId} is duplicated.`);
    }
    sessionIds.add(session.sessionId);
    const ordinals = session.entries.map((entry) => entry.ordinal);
    if (ordinals.some((ordinal, index) => ordinal !== index + 1)) {
      throw new TypeError(
        `Session log ${session.sessionId} entry ordinals must be contiguous.`,
      );
    }
    const substrateIdentities = session.entries.map(
      (entry) =>
        `${entry.substrateIncarnation ?? ""}\u0000${entry.substrateEntryId}`,
    );
    if (new Set(substrateIdentities).size !== substrateIdentities.length) {
      throw new TypeError(
        `Session log ${session.sessionId} repeats a substrate entry identity.`,
      );
    }
    for (const entry of session.entries) {
      if (
        entry.versions.some((version, index) => version.version !== index + 1)
      ) {
        throw new TypeError(
          `Archived entry ${entry.ordinal} has non-contiguous versions.`,
        );
      }
      for (const version of entry.versions) {
        if (!isJsonValue(version.materialized)) {
          throw new TypeError(
            `Archived entry ${entry.ordinal} is not JSON-compatible.`,
          );
        }
      }
    }
    for (const read of session.reads) {
      if (!read.settlements.every(isJsonValue)) {
        throw new TypeError(
          `Session log ${session.sessionId} has a non-JSON settlement.`,
        );
      }
      for (const reference of read.entries) {
        const archived = session.entries[reference.ordinal - 1];
        if (!archived || !archived.versions[reference.version - 1]) {
          throw new TypeError(
            `Session log ${session.sessionId} read references an unknown entry version.`,
          );
        }
      }
      const readOrdinals = read.entries.map((reference) => reference.ordinal);
      if (
        readOrdinals.some(
          (ordinal, index) => index > 0 && ordinal <= readOrdinals[index - 1]!,
        )
      ) {
        throw new TypeError(
          `Session log ${session.sessionId} read entries must be ordered and distinct.`,
        );
      }
    }
    const readIdentities = session.reads.map((read) =>
      canonicalString(read as unknown as JsonValue),
    );
    if (new Set(readIdentities).size !== readIdentities.length) {
      throw new TypeError(
        `Session log ${session.sessionId} repeats a materialized read.`,
      );
    }
  }
  return archive;
};

const sameVersion = (
  archived: ArchivedSessionEntryVersion,
  incoming: SessionLogEntrySnapshot,
): boolean =>
  archived.kind === incoming.kind &&
  archived.text === incoming.text &&
  canonicalString(archived.materialized) ===
    canonicalString(incoming.materialized);

export const archiveSessionLogRead = (
  archive: SessionLogArchive,
  read: SessionLogRead,
): SessionLogArchive => {
  if (
    read.sessionId.length === 0 ||
    read.offset.length === 0 ||
    read.entries.some(
      (entry) =>
        entry.substrateEntryId.length === 0 || !isJsonValue(entry.materialized),
    ) ||
    !read.settlements.every(isJsonValue)
  ) {
    throw new TypeError(
      "A session-log read must be non-empty and JSON-compatible.",
    );
  }
  if (
    new Set(read.entries.map((entry) => entry.substrateEntryId)).size !==
    read.entries.length
  ) {
    throw new TypeError(
      "A materialized session-log read cannot repeat a substrate entry id.",
    );
  }

  const cloned = structuredClone(archive);
  let session = cloned.sessions.find(
    (candidate) => candidate.sessionId === read.sessionId,
  );
  if (!session) {
    session = { sessionId: read.sessionId, entries: [], reads: [] };
    (cloned.sessions as ArchivedSessionLog[]).push(session);
  }
  const entries = session.entries as ArchivedSessionEntry[];
  const readEntries: { ordinal: number; version: number }[] = [];

  for (const incoming of read.entries) {
    let archived = entries.find(
      (candidate) =>
        candidate.substrateEntryId === incoming.substrateEntryId &&
        candidate.substrateIncarnation === read.incarnation,
    );
    if (!archived) {
      archived = {
        ordinal: entries.length + 1,
        substrateEntryId: incoming.substrateEntryId,
        ...(read.incarnation === undefined
          ? {}
          : { substrateIncarnation: read.incarnation }),
        versions: [],
      };
      entries.push(archived);
    }
    const versions = archived.versions as ArchivedSessionEntryVersion[];
    let version = versions.find((candidate) =>
      sameVersion(candidate, incoming),
    );
    if (!version) {
      version = {
        version: versions.length + 1,
        observedAtOffset: read.offset,
        kind: incoming.kind,
        text: incoming.text,
        materialized: structuredClone(incoming.materialized),
      };
      versions.push(version);
    }
    readEntries.push({ ordinal: archived.ordinal, version: version.version });
  }

  const archivedRead: ArchivedSessionRead = {
    offset: read.offset,
    ...(read.substrateConversationId === undefined
      ? {}
      : { substrateConversationId: read.substrateConversationId }),
    ...(read.incarnation === undefined
      ? {}
      : { incarnation: read.incarnation }),
    entries: readEntries,
    settlements: structuredClone(read.settlements),
  };
  const archivedReadIdentity = canonicalString(
    archivedRead as unknown as JsonValue,
  );
  if (
    !session.reads.some(
      (candidate) =>
        canonicalString(candidate as unknown as JsonValue) ===
        archivedReadIdentity,
    )
  ) {
    (session.reads as ArchivedSessionRead[]).push(archivedRead);
  }
  return parseSessionLogArchive(cloned);
};

const currentVersion = (
  entry: ArchivedSessionEntry,
): ArchivedSessionEntryVersion => entry.versions.at(-1)!;

export const resolveEvidenceQuotes = (
  archive: SessionLogArchive,
  sessionId: string,
  quotes: readonly EvidenceQuote[],
): EvidenceResolutionResult => {
  const session = archive.sessions.find(
    (candidate) => candidate.sessionId === sessionId,
  );
  const evidence: EvidenceSpan[] = [];
  const advisories: MultipleEvidenceMatchesAdvisory[] = [];

  for (const quote of quotes) {
    const entries = session?.entries ?? [];
    const allMatches = entries.filter((entry) =>
      currentVersion(entry).text.includes(quote.excerpt),
    );
    const userMatches = allMatches.filter((entry) => {
      const kind = currentVersion(entry).kind;
      return kind === "user" || kind === "user-affordance-payload";
    });
    if (userMatches.length === 0) {
      if (allMatches.length > 0) {
        return {
          ok: false,
          refusal: {
            code: "non-user-evidence",
            excerpt: quote.excerpt,
            message: `The quote "${quote.excerpt}" occurs only in injected non-user entries and cannot be cited as user evidence.`,
          },
        };
      }
      return {
        ok: false,
        refusal: {
          code: "evidence-quote-not-found",
          excerpt: quote.excerpt,
          message: `No user entry contains the verbatim quote "${quote.excerpt}". Repair the quote to match the user's words exactly.`,
        },
      };
    }
    const selected = userMatches.at(-1)!;
    const selectedKind = currentVersion(selected).kind;
    const source =
      selectedKind === "user-affordance-payload"
        ? "user-affordance-payload"
        : "user";
    evidence.push({
      excerpt: quote.excerpt,
      pointer: {
        sessionId,
        entryStart: selected.ordinal,
        entryEnd: selected.ordinal,
      },
      source,
    });
    if (userMatches.length > 1) {
      advisories.push({
        type: "multiple-evidence-matches",
        excerpt: quote.excerpt,
        matchCount: userMatches.length,
        message: `The quote matched ${userMatches.length} user entries; the latest match was selected.`,
      });
    }
  }

  return { ok: true, evidence, advisories };
};

export const readArchivedEntryRange = (
  archive: SessionLogArchive,
  pointer: EvidenceSpan["pointer"],
): readonly ArchivedSessionEntry[] => {
  const session = archive.sessions.find(
    (candidate) => candidate.sessionId === pointer.sessionId,
  );
  const entries = session?.entries.filter(
    (entry) =>
      entry.ordinal >= pointer.entryStart && entry.ordinal <= pointer.entryEnd,
  );
  const expectedLength = pointer.entryEnd - pointer.entryStart + 1;
  if (!entries || entries.length !== expectedLength) {
    throw new TypeError(
      `Evidence range ${pointer.sessionId}:${pointer.entryStart}-${pointer.entryEnd} is not archived.`,
    );
  }
  return structuredClone(entries);
};
