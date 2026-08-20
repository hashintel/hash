import { randomUUID } from 'node:crypto';
import * as v from 'valibot';

export const ABSENCE_STATES = [
  'unknown-to-user',
  'not-yet-decided',
  'not-applicable',
  'explicitly-absent',
  'declined',
  'deferred',
] as const;

export const EPISTEMIC_STATUSES = [
  'explicit',
  'inferred',
  'tentative',
  'defaulted',
  'external-lookup',
] as const;

export const ISSUE_TYPES = [
  'missing',
  'ambiguous',
  'conflicting',
  'invalid',
  'unsupported',
  'unmapped',
  'low-confidence',
] as const;

export type AbsenceState = (typeof ABSENCE_STATES)[number];
export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number];
export type IssueType = (typeof ISSUE_TYPES)[number];
export type CaptureStatus = 'active' | 'superseded' | 'retracted';
export type IssueStatus = 'open' | 'closed';
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
  readonly source: 'user' | 'user-affordance-payload';
}

export type CaptureContent = { readonly value: JsonValue } | { readonly absence: AbsenceState };

interface CaptureProposalCommon {
  readonly confidence: string;
  readonly content: CaptureContent;
  readonly alternativeGroup?: string;
  readonly supersedes?: string;
}

export type CaptureProposal = CaptureProposalCommon &
  (
    | {
        readonly evidence: readonly EvidenceSpan[];
        readonly epistemicStatus: 'explicit' | 'inferred' | 'tentative';
      }
    | {
        readonly basis: {
          readonly type: 'declared-default';
          readonly description: string;
        };
        readonly epistemicStatus: 'defaulted';
      }
    | {
        readonly basis: {
          readonly type: 'documented-transformation';
          readonly description: string;
        };
        readonly epistemicStatus: 'external-lookup';
      }
  );

export type CaptureEnvelope = CaptureProposal & {
  readonly id: string;
  readonly dedupKey: string;
};

export type IssueOrigin =
  | { readonly type: 'harness' }
  | { readonly type: 'plugin'; readonly namespace: string };

export interface CaptureIssue {
  readonly id: string;
  readonly type: IssueType;
  readonly origin: IssueOrigin;
  readonly references: readonly string[];
  readonly canDefault: boolean;
}

export interface CaptureAdvisory {
  readonly type: 'possibly-equivalent';
  readonly reason: 'same-evidence' | 'near-identical-payload';
  readonly captureIds: readonly [string, string];
}

export interface ResolutionRecord {
  readonly type: 'resolution';
  readonly id: string;
  readonly issueId: string;
  readonly decision: string;
  readonly evidence: readonly EvidenceSpan[];
  readonly winnerCaptureId: string;
  readonly loserCaptureIds: readonly string[];
}

export interface RetractionEvent {
  readonly type: 'retraction';
  readonly id: string;
  readonly captureId: string;
  readonly evidence: readonly EvidenceSpan[];
}

export interface IssueClosedEvent {
  readonly type: 'issue-closed';
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
  execute(command: CaptureStoreCommand): Promise<CaptureStoreResult>;
}

export type CaptureStoreCommand =
  | { readonly type: 'apply-sweep'; readonly proposals: readonly CaptureProposal[] }
  | {
      readonly type: 'open-issue';
      readonly issueType: IssueType;
      readonly origin: IssueOrigin;
      readonly references: readonly string[];
      readonly canDefault: boolean;
    }
  | { readonly type: 'close-issue'; readonly issueId: string }
  | {
      readonly type: 'resolve-conflict';
      readonly issueId: string;
      readonly decision: string;
      readonly evidence: readonly EvidenceSpan[];
      readonly winnerCaptureId: string;
      readonly loserCaptureIds: readonly string[];
    }
  | {
      readonly type: 'retract-capture';
      readonly captureId: string;
      readonly evidence: readonly EvidenceSpan[];
    };

export type CaptureStoreRefusal =
  | { readonly code: 'invalid-envelope'; readonly message: string }
  | { readonly code: 'unknown-capture'; readonly message: string; readonly captureId: string }
  | { readonly code: 'unknown-issue'; readonly message: string; readonly issueId: string }
  | { readonly code: 'issue-already-closed'; readonly message: string; readonly issueId: string }
  | { readonly code: 'resolution-required'; readonly message: string; readonly issueId: string }
  | { readonly code: 'invalid-resolution'; readonly message: string; readonly issueId: string }
  | { readonly code: 'invalid-retraction'; readonly message: string; readonly captureId: string }
  | {
      readonly code: 'superseded-target-not-active';
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
        | { readonly eventId: string };
    }
  | { readonly ok: false; readonly refusal: CaptureStoreRefusal };

const nonEmptyString = v.pipe(v.string(), v.nonEmpty());
const positiveInteger = v.pipe(v.number(), v.integer(), v.minValue(1));
const evidenceSpanSchema = v.strictObject({
  excerpt: nonEmptyString,
  pointer: v.strictObject({
    sessionId: nonEmptyString,
    entryStart: positiveInteger,
    entryEnd: positiveInteger,
  }),
  source: v.picklist(['user', 'user-affordance-payload']),
});
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
  epistemicStatus: v.picklist(['explicit', 'inferred', 'tentative']),
};
const defaultedCaptureFields = {
  ...captureCommonFields,
  basis: v.strictObject({
    type: v.literal('declared-default'),
    description: nonEmptyString,
  }),
  epistemicStatus: v.literal('defaulted'),
};
const externalCaptureFields = {
  ...captureCommonFields,
  basis: v.strictObject({
    type: v.literal('documented-transformation'),
    description: nonEmptyString,
  }),
  epistemicStatus: v.literal('external-lookup'),
};
const captureProposalSchema = v.union([
  v.strictObject(userCaptureFields),
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
const issueSchema = v.strictObject({
  id: nonEmptyString,
  type: v.picklist(ISSUE_TYPES),
  origin: v.variant('type', [
    v.strictObject({ type: v.literal('harness') }),
    v.strictObject({ type: v.literal('plugin'), namespace: nonEmptyString }),
  ]),
  references: v.pipe(v.array(nonEmptyString), v.minLength(1)),
  canDefault: v.boolean(),
});
const resolutionSchema = v.strictObject({
  type: v.literal('resolution'),
  id: nonEmptyString,
  issueId: nonEmptyString,
  decision: nonEmptyString,
  evidence: v.pipe(v.array(evidenceSpanSchema), v.minLength(1)),
  winnerCaptureId: nonEmptyString,
  loserCaptureIds: v.pipe(v.array(nonEmptyString), v.minLength(1)),
});
const retractionSchema = v.strictObject({
  type: v.literal('retraction'),
  id: nonEmptyString,
  captureId: nonEmptyString,
  evidence: v.pipe(v.array(evidenceSpanSchema), v.minLength(1)),
});
const issueClosedSchema = v.strictObject({
  type: v.literal('issue-closed'),
  id: nonEmptyString,
  issueId: nonEmptyString,
});
const snapshotSchema = v.strictObject({
  captures: v.array(captureEnvelopeSchema),
  issues: v.array(issueSchema),
  events: v.array(v.variant('type', [resolutionSchema, retractionSchema, issueClosedSchema])),
});

export const createEmptyCaptureStoreSnapshot = (): CaptureStoreSnapshot => ({
  captures: [],
  issues: [],
  events: [],
});

export const parseCaptureStoreSnapshot = (input: unknown): CaptureStoreSnapshot => {
  const snapshot = v.parse(snapshotSchema, input) as CaptureStoreSnapshot;
  for (const records of [snapshot.captures, snapshot.issues, snapshot.events]) {
    if (new Set(records.map((record) => record.id)).size !== records.length) {
      throw new TypeError('Capture-store record ids must be unique within their record family.');
    }
  }
  for (const capture of snapshot.captures) {
    if ('value' in capture.content && !isJsonValue(capture.content.value)) {
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
  for (const event of snapshot.events) {
    if (
      (event.type === 'resolution' || event.type === 'retraction') &&
      !event.evidence.every((span) => span.source === 'user')
    ) {
      throw new TypeError(`${event.type} events must cite the true user's utterance.`);
    }
    if (event.type === 'retraction') {
      if (!snapshot.captures.some((capture) => capture.id === event.captureId)) {
        throw new TypeError(`Retraction ${event.id} references an unknown capture.`);
      }
      continue;
    }
    const issue = snapshot.issues.find((candidate) => candidate.id === event.issueId);
    if (!issue) throw new TypeError(`Event ${event.id} references an unknown issue.`);
    if (event.type === 'issue-closed') {
      if (issue.type === 'conflicting') {
        throw new TypeError('A conflicting issue cannot be closed without a resolution record.');
      }
      continue;
    }
    const citedCaptureIds = [event.winnerCaptureId, ...event.loserCaptureIds];
    if (
      issue.type !== 'conflicting' ||
      citedCaptureIds.length !== issue.references.length ||
      new Set(citedCaptureIds).size !== citedCaptureIds.length ||
      issue.references.some((captureId) => !citedCaptureIds.includes(captureId))
    ) {
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
    if (event.type === 'resolution') {
      for (const loserCaptureId of event.loserCaptureIds) {
        addSuccessor(loserCaptureId, event.winnerCaptureId);
      }
    } else if (event.type === 'retraction') {
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
  return snapshot;
};

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Object.values(value as Record<string, unknown>).every(isJsonValue)
  );
};

const canonicalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
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
    'evidence' in proposal
      ? {
          evidence: [...proposal.evidence]
            .map((span) => canonicalString(span as unknown as JsonValue))
            .sort(),
        }
      : { basis: proposal.basis as unknown as JsonValue };
  const content: JsonValue =
    'absence' in proposal.content
      ? { absence: proposal.content.absence }
      : { value: proposal.content.value };
  return canonicalString({
    ...provenance,
    content,
  });
};

const refusal = (value: CaptureStoreRefusal): CaptureStoreResult => ({ ok: false, refusal: value });

const validateProposal = (input: CaptureProposal): CaptureStoreRefusal | undefined => {
  const parsed = v.safeParse(captureProposalSchema, input);
  if (!parsed.success) {
    return {
      code: 'invalid-envelope',
      message: 'A capture must have valid provenance and exactly one value or absence.',
    };
  }
  if (
    'evidence' in parsed.output &&
    parsed.output.evidence.some((span) => span.pointer.entryEnd < span.pointer.entryStart)
  ) {
    return { code: 'invalid-envelope', message: 'An evidence range cannot end before it starts.' };
  }
  if ('value' in parsed.output.content && !isJsonValue(parsed.output.content.value)) {
    return { code: 'invalid-envelope', message: 'A capture value must be JSON-compatible.' };
  }
  return undefined;
};

export const deriveCaptureStatus = (
  snapshot: CaptureStoreSnapshot,
  captureId: string,
): CaptureStatus => {
  if (
    snapshot.events.some((event) => event.type === 'retraction' && event.captureId === captureId)
  ) {
    return 'retracted';
  }
  if (
    snapshot.captures.some((capture) => capture.supersedes === captureId) ||
    snapshot.events.some(
      (event) => event.type === 'resolution' && event.loserCaptureIds.includes(captureId),
    )
  ) {
    return 'superseded';
  }
  return 'active';
};

export const deriveIssueStatus = (snapshot: CaptureStoreSnapshot, issueId: string): IssueStatus =>
  snapshot.events.some(
    (event) =>
      (event.type === 'resolution' || event.type === 'issue-closed') && event.issueId === issueId,
  )
    ? 'closed'
    : 'open';

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
        event.type === 'resolution' &&
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
        deriveCaptureStatus(snapshot, capture.id) === 'active',
    )
    .map((capture) => capture.id);
};

const evidenceIdentity = (capture: CaptureProposal | CaptureEnvelope): string | undefined =>
  'evidence' in capture
    ? canonicalString(
        [...capture.evidence].map((span) => canonicalString(span as unknown as JsonValue)).sort(),
      )
    : undefined;

const normalizedPayloadText = (capture: CaptureProposal | CaptureEnvelope): string | undefined =>
  'value' in capture.content && typeof capture.content.value === 'string'
    ? capture.content.value.trim().replaceAll(/\s+/g, ' ').toLocaleLowerCase()
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
    const exactRetry = snapshot.captures.some(
      (capture) =>
        capture.dedupKey === dedupKey &&
        capture.supersedes === proposal.supersedes &&
        capture.epistemicStatus === proposal.epistemicStatus &&
        capture.confidence === proposal.confidence &&
        capture.alternativeGroup === proposal.alternativeGroup,
    );
    const duplicateWithoutSupersession =
      !proposal.supersedes && snapshot.captures.some((capture) => capture.dedupKey === dedupKey);
    const duplicateInBatch = accepted.some(
      (candidate) =>
        captureDedupKey(candidate) === dedupKey && candidate.supersedes === proposal.supersedes,
    );
    if (exactRetry || duplicateWithoutSupersession || duplicateInBatch) {
      skippedDedupKeys.push(dedupKey);
      continue;
    }

    if (proposal.supersedes) {
      const target = snapshot.captures.find((capture) => capture.id === proposal.supersedes);
      if (!target) {
        return refusal({
          code: 'unknown-capture',
          message: `No capture exists with id ${proposal.supersedes}.`,
          captureId: proposal.supersedes,
        });
      }
      if (
        deriveCaptureStatus(snapshot, target.id) !== 'active' ||
        targetedCaptures.has(target.id)
      ) {
        return refusal({
          code: 'superseded-target-not-active',
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
    captures.push({ ...structuredClone(proposal), id, dedupKey: captureDedupKey(proposal) });
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
        deriveCaptureStatus(nextSnapshot, left.id) !== 'active' ||
        deriveCaptureStatus(nextSnapshot, right.id) !== 'active' ||
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
          type: 'possibly-equivalent',
          reason: sameEvidence ? 'same-evidence' : 'near-identical-payload',
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
): CaptureStoreResult => {
  switch (command.type) {
    case 'apply-sweep':
      return applySweep(snapshot, command.proposals);

    case 'open-issue': {
      if (
        command.references.length === 0 ||
        command.references.some(
          (captureId) => !snapshot.captures.some((capture) => capture.id === captureId),
        )
      ) {
        return refusal({
          code: 'invalid-envelope',
          message: 'An issue must reference at least one existing capture.',
        });
      }
      const id = `issue-${randomUUID()}`;
      return {
        ok: true,
        snapshot: {
          ...snapshot,
          issues: [
            ...snapshot.issues,
            {
              id,
              type: command.issueType,
              origin: command.origin,
              references: [...command.references],
              canDefault: command.canDefault,
            },
          ],
        },
        value: { issueId: id },
      };
    }

    case 'close-issue': {
      const issue = snapshot.issues.find((candidate) => candidate.id === command.issueId);
      if (!issue) {
        return refusal({
          code: 'unknown-issue',
          message: `No issue exists with id ${command.issueId}.`,
          issueId: command.issueId,
        });
      }
      if (deriveIssueStatus(snapshot, issue.id) === 'closed') {
        return refusal({
          code: 'issue-already-closed',
          message: `Issue ${issue.id} is already closed.`,
          issueId: issue.id,
        });
      }
      if (issue.type === 'conflicting') {
        return refusal({
          code: 'resolution-required',
          message: 'A conflicting issue closes only through a user-cited resolution record.',
          issueId: issue.id,
        });
      }
      const event: IssueClosedEvent = {
        type: 'issue-closed',
        id: `event-${randomUUID()}`,
        issueId: issue.id,
      };
      return {
        ok: true,
        snapshot: { ...snapshot, events: [...snapshot.events, event] },
        value: { eventId: event.id },
      };
    }

    case 'resolve-conflict': {
      const issue = snapshot.issues.find((candidate) => candidate.id === command.issueId);
      if (!issue) {
        return refusal({
          code: 'unknown-issue',
          message: `No issue exists with id ${command.issueId}.`,
          issueId: command.issueId,
        });
      }
      const candidateRecord: ResolutionRecord = {
        type: 'resolution' as const,
        id: `event-${randomUUID()}`,
        issueId: command.issueId,
        decision: command.decision,
        evidence: command.evidence,
        winnerCaptureId: command.winnerCaptureId,
        loserCaptureIds: command.loserCaptureIds,
      };
      const citedCaptureIds = [command.winnerCaptureId, ...command.loserCaptureIds];
      const invalid =
        issue.type !== 'conflicting' ||
        deriveIssueStatus(snapshot, issue.id) === 'closed' ||
        !v.safeParse(resolutionSchema, candidateRecord).success ||
        !command.evidence.every((span) => span.source === 'user') ||
        citedCaptureIds.length !== issue.references.length ||
        issue.references.some((captureId) => !citedCaptureIds.includes(captureId)) ||
        new Set(citedCaptureIds).size !== citedCaptureIds.length ||
        citedCaptureIds.some((captureId) => deriveCaptureStatus(snapshot, captureId) !== 'active');
      if (invalid) {
        return refusal({
          code: 'invalid-resolution',
          message:
            'A conflict resolution must cite the true user and resolve active captures from that issue.',
          issueId: issue.id,
        });
      }
      return {
        ok: true,
        snapshot: { ...snapshot, events: [...snapshot.events, candidateRecord] },
        value: { eventId: candidateRecord.id },
      };
    }

    case 'retract-capture': {
      const capture = snapshot.captures.find((candidate) => candidate.id === command.captureId);
      if (!capture) {
        return refusal({
          code: 'unknown-capture',
          message: `No capture exists with id ${command.captureId}.`,
          captureId: command.captureId,
        });
      }
      const event: RetractionEvent = {
        type: 'retraction',
        id: `event-${randomUUID()}`,
        captureId: command.captureId,
        evidence: [...command.evidence],
      };
      if (
        deriveCaptureStatus(snapshot, capture.id) !== 'active' ||
        !v.safeParse(retractionSchema, event).success ||
        !command.evidence.every((span) => span.source === 'user')
      ) {
        return refusal({
          code: 'invalid-retraction',
          message: 'Only an active capture can be retracted, citing the true user.',
          captureId: capture.id,
        });
      }
      return {
        ok: true,
        snapshot: { ...snapshot, events: [...snapshot.events, event] },
        value: { eventId: event.id },
      };
    }

    default: {
      const exhaustive: never = command;
      return exhaustive;
    }
  }
};
