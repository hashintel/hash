import { randomUUID } from "node:crypto";

import * as v from "valibot";

import {
  resolveEvidenceQuotes,
  type EvidenceQuote,
  type EvidenceResolutionRefusal,
  type MultipleEvidenceMatchesAdvisory,
  type ArchivedSessionEntry,
  type SessionLogArchive,
} from "./session-log.ts";

export const ABSENCE_STATES = [
  "unknown-to-user",
  "not-yet-decided",
  "not-applicable",
  "explicitly-absent",
  "declined",
  "deferred",
] as const;

export const EPISTEMIC_STATUSES = [
  "explicit",
  "inferred",
  "tentative",
  "defaulted",
  "external-lookup",
] as const;

export const ISSUE_TYPES = [
  "missing",
  "ambiguous",
  "conflicting",
  "invalid",
  "unsupported",
  "unmapped",
  "low-confidence",
] as const;

export type AbsenceState = (typeof ABSENCE_STATES)[number];
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type CaptureStatus = "active" | "superseded" | "retracted";
export type IssueStatus = "open" | "closed";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EvidenceSpan {
  readonly excerpt: string;
  readonly pointer: {
    readonly sessionId: string;
    readonly entryStart: number;
    readonly entryEnd: number;
  };
  readonly source: "user" | "user-affordance-payload";
}

export type CaptureContent = { readonly value: JsonValue } | { readonly absence: AbsenceState };

interface CaptureProposalCommon {
  readonly confidence: string;
  readonly content: CaptureContent;
  readonly alternativeGroup?: string;
  readonly supersedes?: string;
}

export type CaptureInputProposal = CaptureProposalCommon &
  (
    | {
        readonly evidence: readonly EvidenceQuote[];
        readonly epistemicStatus: "explicit" | "inferred" | "tentative";
      }
    | {
        readonly basis: {
          readonly type: "declared-default";
          readonly description: string;
        };
        readonly epistemicStatus: "defaulted";
      }
    | {
        readonly basis: {
          readonly type: "documented-transformation";
          readonly description: string;
        };
        readonly epistemicStatus: "external-lookup";
      }
  );

export type CaptureProposal = CaptureProposalCommon &
  (
    | {
        readonly evidence: readonly EvidenceSpan[];
        readonly epistemicStatus: "explicit" | "inferred" | "tentative";
      }
    | {
        readonly basis: {
          readonly type: "declared-default";
          readonly description: string;
        };
        readonly epistemicStatus: "defaulted";
      }
    | {
        readonly basis: {
          readonly type: "documented-transformation";
          readonly description: string;
        };
        readonly epistemicStatus: "external-lookup";
      }
  );

export type CaptureEnvelope = CaptureProposal & {
  readonly id: string;
  readonly dedupKey: string;
};

export type IssueOrigin =
  | { readonly type: "harness" }
  | { readonly type: "plugin"; readonly namespace: string };

export interface CaptureIssue {
  readonly id: string;
  readonly type: IssueType;
  readonly origin: IssueOrigin;
  readonly references: readonly string[];
  readonly canDefault: boolean;
}

export type CaptureAdvisory =
  | {
      readonly type: "possibly-equivalent";
      readonly reason: "same-evidence" | "near-identical-payload";
      readonly captureIds: readonly [string, string];
    }
  | MultipleEvidenceMatchesAdvisory;

export interface ResolutionRecord {
  readonly type: "resolution";
  readonly id: string;
  readonly issueId: string;
  readonly decision: string;
  readonly evidence: readonly EvidenceSpan[];
  readonly winnerCaptureId: string;
  readonly loserCaptureIds: readonly string[];
}

export interface RetractionEvent {
  readonly type: "retraction";
  readonly id: string;
  readonly captureId: string;
  readonly evidence: readonly EvidenceSpan[];
}

export interface IssueClosedEvent {
  readonly type: "issue-closed";
  readonly id: string;
  readonly issueId: string;
}

export type CaptureStoreEvent = ResolutionRecord | RetractionEvent | IssueClosedEvent;

export interface CaptureStoreSnapshot {
  readonly captures: readonly CaptureEnvelope[];
  readonly issues: readonly CaptureIssue[];
  readonly events: readonly CaptureStoreEvent[];
}

export interface CaptureStore {
  read(): Promise<CaptureStoreSnapshot>;
  execute(
    command: CaptureStoreCommand,
    context?: CaptureStoreEvidenceContext,
  ): Promise<CaptureStoreResult>;
  readArchivedEntries(pointer: EvidenceSpan["pointer"]): Promise<readonly ArchivedSessionEntry[]>;
}

export interface CaptureStoreEvidenceContext {
  readonly sessionId: string;
}

export interface CaptureStoreCommandEvidenceContext extends CaptureStoreEvidenceContext {
  readonly archive: SessionLogArchive;
}

export type CaptureStoreCommand =
  | {
      readonly type: "apply-sweep";
      readonly proposals: readonly CaptureInputProposal[];
    }
  | {
      readonly type: "open-issue";
      readonly issueType: IssueType;
      readonly origin: IssueOrigin;
      readonly references: readonly string[];
      readonly canDefault: boolean;
    }
  | { readonly type: "close-issue"; readonly issueId: string }
  | {
      readonly type: "resolve-conflict";
      readonly issueId: string;
      readonly decision: string;
      readonly evidence: readonly EvidenceQuote[];
      readonly winnerCaptureId: string;
      readonly loserCaptureIds: readonly string[];
    }
  | {
      readonly type: "retract-capture";
      readonly captureId: string;
      readonly evidence: readonly EvidenceQuote[];
    };

export type CaptureStoreRefusal =
  | EvidenceResolutionRefusal
  | {
      readonly code: "evidence-session-required";
      readonly message: string;
    }
  | { readonly code: "invalid-envelope"; readonly message: string }
  | {
      readonly code: "unknown-capture";
      readonly message: string;
      readonly captureId: string;
    }
  | {
      readonly code: "unknown-issue";
      readonly message: string;
      readonly issueId: string;
    }
  | {
      readonly code: "issue-already-closed";
      readonly message: string;
      readonly issueId: string;
    }
  | {
      readonly code: "resolution-required";
      readonly message: string;
      readonly issueId: string;
    }
  | {
      readonly code: "invalid-resolution";
      readonly message: string;
      readonly issueId: string;
    }
  | {
      readonly code: "invalid-retraction";
      readonly message: string;
      readonly captureId: string;
    }
  | {
      readonly code: "blocked-by-open-conflict";
      readonly message: string;
      readonly captureId: string;
      readonly blockingIssueIds: readonly string[];
    }
  | {
      readonly code: "superseded-target-not-active";
      readonly message: string;
      readonly targetCaptureId: string;
      readonly currentHeadIds: readonly string[];
    };

export type CaptureStoreResult =
  | {
      readonly ok: true;
      readonly snapshot: CaptureStoreSnapshot;
      readonly value:
        | {
            readonly appliedCaptureIds: readonly string[];
            readonly skippedDedupKeys: readonly string[];
            readonly advisories: readonly CaptureAdvisory[];
          }
        | { readonly issueId: string }
        | {
            readonly eventId: string;
            readonly advisories: readonly CaptureAdvisory[];
          };
    }
  | { readonly ok: false; readonly refusal: CaptureStoreRefusal };

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1));
// Range ordering belongs to this schema rather than to any one caller: every
// surface that accepts evidence — proposals, resolution and retraction
// commands, persisted snapshots — reaches it through here, so all of them
// refuse the same spans.
const evidenceSpanSchema = v.strictObject({
  excerpt: nonEmptyString,
  pointer: v.pipe(
    v.strictObject({
      sessionId: nonEmptyString,
      entryStart: positiveInteger,
      entryEnd: positiveInteger,
    }),
    v.check(
      (pointer) => pointer.entryEnd >= pointer.entryStart,
      "An evidence range cannot end before it starts.",
    ),
  ),
  source: v.picklist(["user", "user-affordance-payload"]),
});
const evidenceQuoteSchema = v.strictObject({ excerpt: nonEmptyString });
const contentSchema = v.union([
  v.strictObject({ value: v.unknown() }),
  v.strictObject({ absence: v.picklist(ABSENCE_STATES) }),
]);
const captureCommonFields = {
  confidence: nonEmptyString,
  content: contentSchema,
  alternativeGroup: v.optional(nonEmptyString),
  supersedes: v.optional(nonEmptyString),
};
const userCaptureFields = {
  ...captureCommonFields,
  evidence: v.pipe(v.array(evidenceSpanSchema), v.minLength(1)),
  epistemicStatus: v.picklist(["explicit", "inferred", "tentative"]),
};
const defaultedCaptureFields = {
  ...captureCommonFields,
  basis: v.strictObject({
    type: v.literal("declared-default"),
    description: nonEmptyString,
  }),
  epistemicStatus: v.literal("defaulted"),
};
const externalCaptureFields = {
  ...captureCommonFields,
  basis: v.strictObject({
    type: v.literal("documented-transformation"),
    description: nonEmptyString,
  }),
  epistemicStatus: v.literal("external-lookup"),
};
const captureProposalSchema = v.union([
  v.strictObject(userCaptureFields),
  v.strictObject(defaultedCaptureFields),
  v.strictObject(externalCaptureFields),
]);
export const CaptureInputProposalSchema = v.union([
  v.strictObject({
    ...captureCommonFields,
    evidence: v.pipe(v.array(evidenceQuoteSchema), v.minLength(1)),
    epistemicStatus: v.picklist(["explicit", "inferred", "tentative"]),
  }),
  v.strictObject(defaultedCaptureFields),
  v.strictObject(externalCaptureFields),
]);
const envelopeIdentityFields = {
  id: nonEmptyString,
  dedupKey: nonEmptyString,
};
const captureEnvelopeSchema = v.union([
  v.strictObject({ ...userCaptureFields, ...envelopeIdentityFields }),
  v.strictObject({ ...defaultedCaptureFields, ...envelopeIdentityFields }),
  v.strictObject({ ...externalCaptureFields, ...envelopeIdentityFields }),
]);
const issueSchema = v.pipe(
  v.strictObject({
    id: nonEmptyString,
    type: v.picklist(ISSUE_TYPES),
    origin: v.variant("type", [
      v.strictObject({ type: v.literal("harness") }),
      v.strictObject({ type: v.literal("plugin"), namespace: nonEmptyString }),
    ]),
    // A set, not a list: the resolution rule below compares reference sets, and
    // a repeated reference makes an issue's population ambiguous — two captures
    // in conflict or one, cited twice.
    references: v.pipe(
      v.array(nonEmptyString),
      v.minLength(1),
      v.check(
        (references) => new Set(references).size === references.length,
        "Issue references must be distinct capture ids.",
      ),
    ),
    canDefault: v.boolean(),
  }),
  // A conflict between one capture is not a conflict, and it can never close:
  // closing one takes a resolution, a resolution cites a winner and at least
  // one loser, and that cited set can never equal a single reference.
  v.check(
    (issue) => issue.type !== "conflicting" || issue.references.length >= 2,
    "A conflicting issue must reference at least two captures.",
  ),
);
const resolutionSchema = v.strictObject({
  type: v.literal("resolution"),
  id: nonEmptyString,
  issueId: nonEmptyString,
  decision: nonEmptyString,
  evidence: v.pipe(v.array(evidenceSpanSchema), v.minLength(1)),
  winnerCaptureId: nonEmptyString,
  loserCaptureIds: v.pipe(v.array(nonEmptyString), v.minLength(1)),
});
const retractionSchema = v.strictObject({
  type: v.literal("retraction"),
  id: nonEmptyString,
  captureId: nonEmptyString,
  evidence: v.pipe(v.array(evidenceSpanSchema), v.minLength(1)),
});
const issueClosedSchema = v.strictObject({
  type: v.literal("issue-closed"),
  id: nonEmptyString,
  issueId: nonEmptyString,
});
const snapshotSchema = v.strictObject({
  captures: v.array(captureEnvelopeSchema),
  issues: v.array(issueSchema),
  events: v.array(v.variant("type", [resolutionSchema, retractionSchema, issueClosedSchema])),
});

/**
 * Whether two id lists denote the same set, neither repeating. The rule a
 * resolution has to satisfy is set equality; the length-plus-membership pair
 * this replaces agreed with it only while references happened to be distinct.
 */
const denotesSameCaptureSet = (left: readonly string[], right: readonly string[]): boolean => {
  const leftIds = new Set(left);
  const rightIds = new Set(right);
  return (
    leftIds.size === left.length &&
    rightIds.size === right.length &&
    leftIds.size === rightIds.size &&
    [...leftIds].every((captureId) => rightIds.has(captureId))
  );
};

export const createEmptyCaptureStoreSnapshot = (): CaptureStoreSnapshot => ({
  captures: [],
  issues: [],
  events: [],
});

export const parseCaptureStoreSnapshot = (input: unknown): CaptureStoreSnapshot => {
  const snapshot = v.parse(snapshotSchema, input) as CaptureStoreSnapshot;
  for (const records of [snapshot.captures, snapshot.issues, snapshot.events]) {
    if (new Set(records.map((record) => record.id)).size !== records.length) {
      throw new TypeError("Capture-store record ids must be unique within their record family.");
    }
  }
  for (const capture of snapshot.captures) {
    if ("value" in capture.content && !isJsonValue(capture.content.value)) {
      throw new TypeError(`Capture ${capture.id} contains a value that cannot be stored as JSON`);
    }
    if (capture.dedupKey !== captureDedupKey(capture)) {
      throw new TypeError(`Capture ${capture.id} has a stale content dedup key.`);
    }
    if (
      capture.supersedes &&
      !snapshot.captures.some((candidate) => candidate.id === capture.supersedes)
    ) {
      throw new TypeError(`Capture ${capture.id} supersedes an unknown capture.`);
    }
  }
  const closingEventByIssue = new Map<string, string>();
  for (const event of snapshot.events) {
    if (
      (event.type === "resolution" || event.type === "retraction") &&
      !event.evidence.every((span) => span.source === "user")
    ) {
      throw new TypeError(
        `${event.type} events must cite evidence whose declared source is the user.`,
      );
    }
    if (event.type === "retraction") {
      if (!snapshot.captures.some((capture) => capture.id === event.captureId)) {
        throw new TypeError(`Retraction ${event.id} references an unknown capture.`);
      }
      continue;
    }
    const issue = snapshot.issues.find((candidate) => candidate.id === event.issueId);
    if (!issue) throw new TypeError(`Event ${event.id} references an unknown issue.`);
    const previousClosingEventId = closingEventByIssue.get(issue.id);
    if (previousClosingEventId !== undefined) {
      throw new TypeError(
        `Issue ${issue.id} has more than one closing event: ${previousClosingEventId} and ${event.id}.`,
      );
    }
    closingEventByIssue.set(issue.id, event.id);
    if (event.type === "issue-closed") {
      if (issue.type === "conflicting") {
        throw new TypeError("A conflicting issue cannot be closed without a resolution record.");
      }
      continue;
    }
    const citedCaptureIds = [event.winnerCaptureId, ...event.loserCaptureIds];
    if (issue.type !== "conflicting" || !denotesSameCaptureSet(issue.references, citedCaptureIds)) {
      throw new TypeError(`Resolution ${event.id} does not account for its conflict's captures.`);
    }
  }
  for (const issue of snapshot.issues) {
    if (
      issue.references.some(
        (captureId) => !snapshot.captures.some((capture) => capture.id === captureId),
      )
    ) {
      throw new TypeError(`Issue ${issue.id} references an unknown capture.`);
    }
  }
  const successorByCapture = new Map<string, string>();
  const addSuccessor = (captureId: string, successorId: string): void => {
    if (successorByCapture.has(captureId)) {
      throw new TypeError(`Capture ${captureId} has a forking supersession history.`);
    }
    successorByCapture.set(captureId, successorId);
  };
  for (const capture of snapshot.captures) {
    if (capture.supersedes) addSuccessor(capture.supersedes, capture.id);
  }
  for (const event of snapshot.events) {
    if (event.type === "resolution") {
      for (const loserCaptureId of event.loserCaptureIds) {
        addSuccessor(loserCaptureId, event.winnerCaptureId);
      }
    } else if (event.type === "retraction") {
      addSuccessor(event.captureId, event.id);
    }
  }
  for (const capture of snapshot.captures) {
    const visited = new Set<string>();
    let current: string | undefined = capture.id;
    while (current && snapshot.captures.some((candidate) => candidate.id === current)) {
      if (visited.has(current)) {
        throw new TypeError(`Capture ${capture.id} participates in a supersession cycle.`);
      }
      visited.add(current);
      current = successorByCapture.get(current);
    }
  }
  const openConflicts = snapshot.issues.filter(
    (issue) => issue.type === "conflicting" && !closingEventByIssue.has(issue.id),
  );
  for (const [index, issue] of openConflicts.entries()) {
    const inactiveReference = issue.references.find(
      (captureId) => deriveCaptureStatus(snapshot, captureId) !== "active",
    );
    if (inactiveReference !== undefined) {
      throw new TypeError(
        `Open conflict ${issue.id} references inactive capture ${inactiveReference}.`,
      );
    }
    const overlappingIssue = openConflicts
      .slice(index + 1)
      .find((candidate) =>
        candidate.references.some((captureId) => issue.references.includes(captureId)),
      );
    if (overlappingIssue !== undefined) {
      throw new TypeError(
        `Open conflicts ${issue.id} and ${overlappingIssue.id} share a capture reference.`,
      );
    }
  }
  return snapshot;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  // Negative zero is refused alongside the non-finite numbers: JSON.stringify
  // writes it as "0", so the read path could never reproduce what was accepted.
  if (typeof value === "number") return Number.isFinite(value) && !Object.is(value, -0);
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

const canonicalString = (value: JsonValue): string => JSON.stringify(canonicalize(value));

export const captureDedupKey = (proposal: CaptureProposal): string => {
  const provenance: JsonValue =
    "evidence" in proposal
      ? {
          evidence: [...proposal.evidence]
            .map((span) => canonicalString(span as unknown as JsonValue))
            .sort(),
        }
      : { basis: proposal.basis as unknown as JsonValue };
  const content: JsonValue =
    "absence" in proposal.content
      ? { absence: proposal.content.absence }
      : { value: proposal.content.value };
  return canonicalString({
    ...provenance,
    content,
  });
};

/**
 * The model's quote-only proposal identity before the harness anchors it. It
 * deliberately has no pointer or source: those are assigned by the harness
 * after the proposal crosses this boundary.
 */
const captureOccurrenceKey = (
  proposal: CaptureInputProposal | CaptureEnvelope,
): string | undefined => {
  if (!("evidence" in proposal)) return undefined;
  const content: JsonValue =
    "absence" in proposal.content
      ? { absence: proposal.content.absence }
      : { value: proposal.content.value };
  return canonicalString({
    evidence: proposal.evidence.map((evidence) => evidence.excerpt).sort(),
    content,
  });
};

/**
 * Sweep retries identify evidence by its harness-owned pointer and cited text,
 * not its current source classification. A binding may later recognize that the
 * same archived entry is an affordance payload; that is a provenance update,
 * not another user occurrence. `dedupKey` remains the persisted content key so
 * existing target documents retain their validated shape.
 */
const captureRetryKey = (proposal: CaptureProposal): string => {
  const provenance: JsonValue =
    "evidence" in proposal
      ? {
          evidence: [...proposal.evidence]
            .map((span) =>
              canonicalString({
                excerpt: span.excerpt,
                pointer: span.pointer,
              } as unknown as JsonValue),
            )
            .sort(),
        }
      : { basis: proposal.basis as unknown as JsonValue };
  const content: JsonValue =
    "absence" in proposal.content
      ? { absence: proposal.content.absence }
      : { value: proposal.content.value };
  return canonicalString({
    ...provenance,
    content,
  });
};

const priorEvidenceForOccurrence = (
  snapshot: CaptureStoreSnapshot,
  sessionId: string,
  proposal: CaptureInputProposal,
  occurrence: number,
): readonly EvidenceSpan[] | undefined => {
  const occurrenceKey = captureOccurrenceKey(proposal);
  if (occurrenceKey === undefined) return undefined;
  return snapshot.captures
    .filter(
      (
        capture,
      ): capture is Extract<CaptureEnvelope, { readonly evidence: readonly EvidenceSpan[] }> =>
        "evidence" in capture &&
        capture.evidence.every((evidence) => evidence.pointer.sessionId === sessionId) &&
        captureOccurrenceKey(capture) === occurrenceKey,
    )
    .at(occurrence)?.evidence;
};

const refusal = (value: CaptureStoreRefusal): CaptureStoreResult => ({
  ok: false,
  refusal: value,
});

const validateProposal = (input: CaptureProposal): CaptureStoreRefusal | undefined => {
  const parsed = v.safeParse(captureProposalSchema, input);
  if (!parsed.success) {
    return {
      code: "invalid-envelope",
      // States what the schema checked, and no more: the spans are structurally
      // well formed and declare a source, which is not the same as provenance
      // having been resolved against an entry projection.
      message:
        "A capture must carry the provenance shape its epistemic status names, exactly one of value or absence, and evidence ranges that do not end before they start.",
    };
  }
  if ("value" in parsed.output.content && !isJsonValue(parsed.output.content.value)) {
    return {
      code: "invalid-envelope",
      message: "A capture value must be JSON-compatible.",
    };
  }
  return undefined;
};

const validateInputProposal = (input: CaptureInputProposal): CaptureStoreRefusal | undefined => {
  const parsed = v.safeParse(CaptureInputProposalSchema, input);
  if (!parsed.success) {
    return {
      code: "invalid-envelope",
      message:
        "A capture must carry the provenance shape its epistemic status names, exactly one of value or absence, and non-empty verbatim evidence quotes.",
    };
  }
  if ("value" in parsed.output.content && !isJsonValue(parsed.output.content.value)) {
    return {
      code: "invalid-envelope",
      message: "A capture value must be JSON-compatible.",
    };
  }
  return undefined;
};

const requireEvidenceContext = (
  context: CaptureStoreCommandEvidenceContext | undefined,
): CaptureStoreCommandEvidenceContext | CaptureStoreRefusal =>
  context ?? {
    code: "evidence-session-required",
    message: "Evidence-bearing commands require the harness-owned session context.",
  };

export const deriveCaptureStatus = (
  snapshot: CaptureStoreSnapshot,
  captureId: string,
): CaptureStatus => {
  if (
    snapshot.events.some((event) => event.type === "retraction" && event.captureId === captureId)
  ) {
    return "retracted";
  }
  if (
    snapshot.captures.some((capture) => capture.supersedes === captureId) ||
    snapshot.events.some(
      (event) => event.type === "resolution" && event.loserCaptureIds.includes(captureId),
    )
  ) {
    return "superseded";
  }
  return "active";
};

export const deriveIssueStatus = (snapshot: CaptureStoreSnapshot, issueId: string): IssueStatus =>
  snapshot.events.some(
    (event) =>
      (event.type === "resolution" || event.type === "issue-closed") && event.issueId === issueId,
  )
    ? "closed"
    : "open";

/**
 * The unresolved conflicts a capture is named by, which pin it: while one is
 * open, superseding or retracting the capture would settle the contradiction by
 * correction and leave the issue as litter — invariant 2's letter kept (no
 * conflict closed without a user-cited record) and its point lost. Together with
 * a conflict's two-active-reference minimum, this is what keeps every open
 * conflict resolvable: its captures cannot leave the active set behind its back.
 */
const openConflictsNaming = (snapshot: CaptureStoreSnapshot, captureId: string): string[] =>
  snapshot.issues
    .filter(
      (issue) =>
        issue.type === "conflicting" &&
        issue.references.includes(captureId) &&
        deriveIssueStatus(snapshot, issue.id) === "open",
    )
    .map((issue) => issue.id);

const currentHeads = (snapshot: CaptureStoreSnapshot, captureId: string): string[] => {
  const reachable = new Set([captureId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const capture of snapshot.captures) {
      if (capture.supersedes && reachable.has(capture.supersedes) && !reachable.has(capture.id)) {
        reachable.add(capture.id);
        changed = true;
      }
    }
    for (const event of snapshot.events) {
      if (
        event.type === "resolution" &&
        event.loserCaptureIds.some((loserId) => reachable.has(loserId)) &&
        !reachable.has(event.winnerCaptureId)
      ) {
        reachable.add(event.winnerCaptureId);
        changed = true;
      }
    }
  }
  return snapshot.captures
    .filter(
      (capture) =>
        capture.id !== captureId &&
        reachable.has(capture.id) &&
        deriveCaptureStatus(snapshot, capture.id) === "active",
    )
    .map((capture) => capture.id);
};

const evidenceIdentity = (capture: CaptureProposal | CaptureEnvelope): string | undefined =>
  "evidence" in capture
    ? canonicalString(
        [...capture.evidence].map((span) => canonicalString(span as unknown as JsonValue)).sort(),
      )
    : undefined;

const normalizedPayloadText = (capture: CaptureProposal | CaptureEnvelope): string | undefined =>
  "value" in capture.content && typeof capture.content.value === "string"
    ? capture.content.value.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase()
    : undefined;

const applySweep = (
  snapshot: CaptureStoreSnapshot,
  proposals: readonly CaptureProposal[],
): CaptureStoreResult => {
  const accepted: CaptureProposal[] = [];
  const skippedDedupKeys: string[] = [];
  const targetedCaptures = new Set<string>();

  for (const proposal of proposals) {
    const invalid = validateProposal(proposal);
    if (invalid) return refusal(invalid);

    const dedupKey = captureDedupKey(proposal);
    const retryKey = captureRetryKey(proposal);
    const exactRetry = snapshot.captures.some(
      (capture) =>
        captureRetryKey(capture) === retryKey &&
        capture.supersedes === proposal.supersedes &&
        capture.epistemicStatus === proposal.epistemicStatus &&
        capture.confidence === proposal.confidence &&
        capture.alternativeGroup === proposal.alternativeGroup,
    );
    const duplicateWithoutSupersession =
      !proposal.supersedes &&
      snapshot.captures.some((capture) => captureRetryKey(capture) === retryKey);
    const duplicateInBatch = accepted.some(
      (candidate) =>
        captureRetryKey(candidate) === retryKey && candidate.supersedes === proposal.supersedes,
    );
    if (exactRetry || duplicateWithoutSupersession || duplicateInBatch) {
      skippedDedupKeys.push(dedupKey);
      continue;
    }

    if (proposal.supersedes) {
      const target = snapshot.captures.find((capture) => capture.id === proposal.supersedes);
      if (!target) {
        return refusal({
          code: "unknown-capture",
          message: `No capture exists with id ${proposal.supersedes}.`,
          captureId: proposal.supersedes,
        });
      }
      // Before the head check, because a pinned capture's blocker is the
      // conflict rather than its position in the supersession chain: the caller
      // has to resolve the issue, not retarget the head.
      const blockingIssueIds = openConflictsNaming(snapshot, target.id);
      if (blockingIssueIds.length > 0) {
        return refusal({
          code: "blocked-by-open-conflict",
          message: `Capture ${target.id} cannot be superseded while an unresolved conflict names it; resolve the conflict first.`,
          captureId: target.id,
          blockingIssueIds,
        });
      }
      if (
        deriveCaptureStatus(snapshot, target.id) !== "active" ||
        targetedCaptures.has(target.id)
      ) {
        return refusal({
          code: "superseded-target-not-active",
          message: `Capture ${target.id} is no longer an active head.`,
          targetCaptureId: target.id,
          currentHeadIds: currentHeads(snapshot, target.id),
        });
      }
      targetedCaptures.add(target.id);
    }
    accepted.push(proposal);
  }

  const captures = [...snapshot.captures];
  const appliedCaptureIds: string[] = [];
  for (const proposal of accepted) {
    const id = `capture-${randomUUID()}`;
    captures.push({
      ...structuredClone(proposal),
      id,
      dedupKey: captureDedupKey(proposal),
    });
    appliedCaptureIds.push(id);
  }
  const nextSnapshot = { ...snapshot, captures };
  const advisories: CaptureAdvisory[] = [];
  for (let leftIndex = 0; leftIndex < captures.length; leftIndex += 1) {
    const left = captures[leftIndex]!;
    for (let rightIndex = leftIndex + 1; rightIndex < captures.length; rightIndex += 1) {
      const right = captures[rightIndex]!;
      if (
        (!appliedCaptureIds.includes(left.id) && !appliedCaptureIds.includes(right.id)) ||
        deriveCaptureStatus(nextSnapshot, left.id) !== "active" ||
        deriveCaptureStatus(nextSnapshot, right.id) !== "active" ||
        left.dedupKey === right.dedupKey
      ) {
        continue;
      }
      const sameEvidence =
        evidenceIdentity(left) !== undefined && evidenceIdentity(left) === evidenceIdentity(right);
      const leftPayload = normalizedPayloadText(left);
      const nearIdenticalPayload =
        leftPayload !== undefined && leftPayload === normalizedPayloadText(right);
      if (sameEvidence || nearIdenticalPayload) {
        advisories.push({
          type: "possibly-equivalent",
          reason: sameEvidence ? "same-evidence" : "near-identical-payload",
          captureIds: [left.id, right.id],
        });
      }
    }
  }
  return {
    ok: true,
    snapshot: nextSnapshot,
    value: { appliedCaptureIds, skippedDedupKeys, advisories },
  };
};

export const applyCaptureStoreCommand = (
  snapshot: CaptureStoreSnapshot,
  command: CaptureStoreCommand,
  evidenceContext?: CaptureStoreCommandEvidenceContext,
): CaptureStoreResult => {
  switch (command.type) {
    case "apply-sweep": {
      const invalidProposal = command.proposals
        .map(validateInputProposal)
        .find((candidate) => candidate !== undefined);
      if (invalidProposal) return refusal(invalidProposal);

      const proposals: CaptureProposal[] = [];
      const anchoringAdvisories: MultipleEvidenceMatchesAdvisory[] = [];
      const occurrencesByKey = new Map<string, number>();
      for (const proposal of command.proposals) {
        if (!("evidence" in proposal)) {
          proposals.push(structuredClone(proposal));
          continue;
        }
        const context = requireEvidenceContext(evidenceContext);
        if ("code" in context) return refusal(context);
        const occurrenceKey = captureOccurrenceKey(proposal);
        if (occurrenceKey !== undefined) {
          const occurrence = occurrencesByKey.get(occurrenceKey) ?? 0;
          occurrencesByKey.set(occurrenceKey, occurrence + 1);
          const priorEvidence = priorEvidenceForOccurrence(
            snapshot,
            context.sessionId,
            proposal,
            occurrence,
          );
          if (priorEvidence !== undefined) {
            proposals.push({
              ...structuredClone(proposal),
              evidence: structuredClone(priorEvidence),
            });
            continue;
          }
        }
        const resolved = resolveEvidenceQuotes(
          context.archive,
          context.sessionId,
          proposal.evidence,
        );
        if (!resolved.ok) return refusal(resolved.refusal);
        proposals.push({
          ...structuredClone(proposal),
          evidence: resolved.evidence,
        });
        anchoringAdvisories.push(...resolved.advisories);
      }
      const result = applySweep(snapshot, proposals);
      if (!result.ok || !("appliedCaptureIds" in result.value)) return result;
      return {
        ...result,
        value: {
          ...result.value,
          advisories: [...anchoringAdvisories, ...result.value.advisories],
        },
      };
    }

    case "open-issue": {
      const candidateIssue: CaptureIssue = {
        id: `issue-${randomUUID()}`,
        type: command.issueType,
        origin: command.origin,
        references: structuredClone(command.references),
        canDefault: command.canDefault,
      };
      // Through the same schema a persisted issue is read with, so a command
      // cannot mint an issue the next read rejects.
      if (!v.safeParse(issueSchema, candidateIssue).success) {
        return refusal({
          code: "invalid-envelope",
          message:
            "An issue must carry a known type, an origin naming its producer, and distinct references to at least one capture; a conflicting issue needs at least two.",
        });
      }
      const unknownReference = candidateIssue.references.find(
        (captureId) => !snapshot.captures.some((capture) => capture.id === captureId),
      );
      if (unknownReference !== undefined) {
        return refusal({
          code: "invalid-envelope",
          message: `An issue must reference existing captures; no capture exists with id ${unknownReference}.`,
        });
      }
      // Activity is a fact about this snapshot, so it is checked here rather
      // than in the schema: a closed conflict's captures are legitimately
      // superseded afterwards, and a persisted issue must still parse.
      const inactiveReference =
        candidateIssue.type === "conflicting"
          ? candidateIssue.references.find(
              (captureId) => deriveCaptureStatus(snapshot, captureId) !== "active",
            )
          : undefined;
      if (inactiveReference !== undefined) {
        return refusal({
          code: "invalid-envelope",
          message: `A new conflicting issue must reference active captures; capture ${inactiveReference} is ${deriveCaptureStatus(snapshot, inactiveReference)}.`,
        });
      }
      const overlappingOpenConflict =
        candidateIssue.type === "conflicting"
          ? snapshot.issues.find(
              (issue) =>
                issue.type === "conflicting" &&
                deriveIssueStatus(snapshot, issue.id) === "open" &&
                issue.references.some((captureId) => candidateIssue.references.includes(captureId)),
            )
          : undefined;
      if (overlappingOpenConflict !== undefined) {
        return refusal({
          code: "invalid-envelope",
          message: `Open conflicts cannot share capture references; issue ${overlappingOpenConflict.id} already names one of them.`,
        });
      }
      return {
        ok: true,
        snapshot: { ...snapshot, issues: [...snapshot.issues, candidateIssue] },
        value: { issueId: candidateIssue.id },
      };
    }

    case "close-issue": {
      const issue = snapshot.issues.find((candidate) => candidate.id === command.issueId);
      if (!issue) {
        return refusal({
          code: "unknown-issue",
          message: `No issue exists with id ${command.issueId}.`,
          issueId: command.issueId,
        });
      }
      if (deriveIssueStatus(snapshot, issue.id) === "closed") {
        return refusal({
          code: "issue-already-closed",
          message: `Issue ${issue.id} is already closed.`,
          issueId: issue.id,
        });
      }
      if (issue.type === "conflicting") {
        return refusal({
          code: "resolution-required",
          message: "A conflicting issue closes only through a user-cited resolution record.",
          issueId: issue.id,
        });
      }
      const event: IssueClosedEvent = {
        type: "issue-closed",
        id: `event-${randomUUID()}`,
        issueId: issue.id,
      };
      return {
        ok: true,
        snapshot: { ...snapshot, events: [...snapshot.events, event] },
        value: { eventId: event.id, advisories: [] },
      };
    }

    case "resolve-conflict": {
      const issue = snapshot.issues.find((candidate) => candidate.id === command.issueId);
      if (!issue) {
        return refusal({
          code: "unknown-issue",
          message: `No issue exists with id ${command.issueId}.`,
          issueId: command.issueId,
        });
      }
      if (
        !v.safeParse(v.pipe(v.array(evidenceQuoteSchema), v.minLength(1)), command.evidence).success
      ) {
        return refusal({
          code: "invalid-resolution",
          message: "A conflict resolution must cite non-empty verbatim user quotes.",
          issueId: issue.id,
        });
      }
      const context = requireEvidenceContext(evidenceContext);
      if ("code" in context) return refusal(context);
      const resolved = resolveEvidenceQuotes(context.archive, context.sessionId, command.evidence);
      if (!resolved.ok) return refusal(resolved.refusal);
      const candidateRecord: ResolutionRecord = {
        type: "resolution" as const,
        id: `event-${randomUUID()}`,
        issueId: command.issueId,
        decision: command.decision,
        // Cloned, not aliased: the snapshot is the store's record, and a caller
        // that keeps its evidence array must not be able to edit it afterwards.
        evidence: structuredClone(resolved.evidence),
        winnerCaptureId: command.winnerCaptureId,
        loserCaptureIds: structuredClone(command.loserCaptureIds),
      };
      const citedCaptureIds = [command.winnerCaptureId, ...command.loserCaptureIds];
      const invalid =
        issue.type !== "conflicting" ||
        deriveIssueStatus(snapshot, issue.id) === "closed" ||
        !v.safeParse(resolutionSchema, candidateRecord).success ||
        !resolved.evidence.every((span) => span.source === "user") ||
        !denotesSameCaptureSet(issue.references, citedCaptureIds) ||
        citedCaptureIds.some((captureId) => deriveCaptureStatus(snapshot, captureId) !== "active");
      if (invalid) {
        return refusal({
          code: "invalid-resolution",
          message:
            "A conflict resolution must name an open conflicting issue, declare the user as its evidence source, and account for exactly that issue’s captures, each still active.",
          issueId: issue.id,
        });
      }
      return {
        ok: true,
        snapshot: {
          ...snapshot,
          events: [...snapshot.events, candidateRecord],
        },
        value: { eventId: candidateRecord.id, advisories: resolved.advisories },
      };
    }

    case "retract-capture": {
      const capture = snapshot.captures.find((candidate) => candidate.id === command.captureId);
      if (!capture) {
        return refusal({
          code: "unknown-capture",
          message: `No capture exists with id ${command.captureId}.`,
          captureId: command.captureId,
        });
      }
      const blockingIssueIds = openConflictsNaming(snapshot, capture.id);
      if (blockingIssueIds.length > 0) {
        return refusal({
          code: "blocked-by-open-conflict",
          message: `Capture ${capture.id} cannot be retracted while an unresolved conflict names it; resolve the conflict first.`,
          captureId: capture.id,
          blockingIssueIds,
        });
      }
      if (
        !v.safeParse(v.pipe(v.array(evidenceQuoteSchema), v.minLength(1)), command.evidence).success
      ) {
        return refusal({
          code: "invalid-retraction",
          message: "A retraction must cite non-empty verbatim user quotes.",
          captureId: capture.id,
        });
      }
      const context = requireEvidenceContext(evidenceContext);
      if ("code" in context) return refusal(context);
      const resolved = resolveEvidenceQuotes(context.archive, context.sessionId, command.evidence);
      if (!resolved.ok) return refusal(resolved.refusal);
      const event: RetractionEvent = {
        type: "retraction",
        id: `event-${randomUUID()}`,
        captureId: command.captureId,
        // Cloned for the same reason as a resolution's: a shallow array copy
        // still shares every span object with the caller.
        evidence: structuredClone(resolved.evidence),
      };
      if (
        deriveCaptureStatus(snapshot, capture.id) !== "active" ||
        !v.safeParse(retractionSchema, event).success ||
        !resolved.evidence.every((span) => span.source === "user")
      ) {
        return refusal({
          code: "invalid-retraction",
          message:
            "Only an active capture can be retracted, and its evidence must declare the user as its source.",
          captureId: capture.id,
        });
      }
      return {
        ok: true,
        snapshot: { ...snapshot, events: [...snapshot.events, event] },
        value: { eventId: event.id, advisories: resolved.advisories },
      };
    }

    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
};
