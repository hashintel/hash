import { describe, expect, test } from 'bun:test';
import {
  applyCaptureStoreCommand,
  captureDedupKey,
  createEmptyCaptureStoreSnapshot,
  deriveCaptureStatus,
  deriveIssueStatus,
  parseCaptureStoreSnapshot,
  type CaptureProposal,
  type CaptureStoreSnapshot,
  type EvidenceSpan,
} from '../src/capture-store.ts';

const userEvidence = (excerpt: string, entry = 1): EvidenceSpan => ({
  excerpt,
  pointer: { sessionId: 'session-1', entryStart: entry, entryEnd: entry },
  source: 'user',
});

type UserCaptureProposal = Extract<CaptureProposal, { readonly evidence: readonly EvidenceSpan[] }>;

const valueProposal = (
  value: string,
  evidence = userEvidence(value),
  overrides: Partial<Omit<UserCaptureProposal, 'content' | 'evidence'>> = {},
): UserCaptureProposal => ({
  evidence: [evidence],
  epistemicStatus: 'explicit',
  confidence: 'high',
  content: { value },
  ...overrides,
});

const apply = (
  snapshot: CaptureStoreSnapshot,
  command: Parameters<typeof applyCaptureStoreCommand>[1],
) => {
  const result = applyCaptureStoreCommand(snapshot, command);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal.message);
  return result;
};

describe('capture-store contract', () => {
  test('harness-invariant: 5 — retries deduplicate by evidence and content, not epistemic status', () => {
    const proposal = valueProposal('budget = €20,000');
    const first = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [proposal],
    });
    const retry = apply(first.snapshot, {
      type: 'apply-sweep',
      proposals: [{ ...proposal, epistemicStatus: 'tentative' }],
    });

    expect(first.snapshot.captures).toHaveLength(1);
    expect(retry.snapshot.captures).toHaveLength(1);
    expect(retry.value).toEqual({
      appliedCaptureIds: [],
      skippedDedupKeys: [captureDedupKey(proposal)],
      advisories: [],
    });

    const originalId = retry.snapshot.captures[0]!.id;
    const revisedReading = apply(retry.snapshot, {
      type: 'apply-sweep',
      proposals: [{ ...proposal, epistemicStatus: 'tentative', supersedes: originalId }],
    });
    expect(revisedReading.snapshot.captures).toHaveLength(2);
    expect(revisedReading.snapshot.captures[1]).toMatchObject({
      dedupKey: captureDedupKey(proposal),
      epistemicStatus: 'tentative',
      supersedes: originalId,
    });
  });

  test('same-evidence and near-identical active values surface ephemeral equivalence advisories', () => {
    const sharedEvidence = userEvidence('The launch is June.', 1);
    const result = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [
        valueProposal('launch = June', sharedEvidence),
        valueProposal('release = June', sharedEvidence),
        valueProposal('  LAUNCH   = june ', userEvidence('June is the launch month.', 2)),
      ],
    });
    if (!('advisories' in result.value)) throw new Error('A sweep did not return advisories.');

    expect(result.value.advisories.map((advisory) => advisory.reason).sort()).toEqual([
      'near-identical-payload',
      'same-evidence',
    ]);
    expect(result.snapshot.events).toEqual([]);
  });

  test('harness-invariant: 7 — one invalid proposal refuses the whole sweep', () => {
    const before = createEmptyCaptureStoreSnapshot();
    const result = applyCaptureStoreCommand(before, {
      type: 'apply-sweep',
      proposals: [
        valueProposal('valid'),
        {
          evidence: [userEvidence('invalid', 2)],
          epistemicStatus: 'explicit',
          confidence: 'high',
          content: { value: 'value', absence: 'deferred' },
        } as unknown as CaptureProposal,
      ],
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ refusal: { code: 'invalid-envelope' } });
    expect(before).toEqual(createEmptyCaptureStoreSnapshot());
  });

  test('harness-invariant: 9 — all six absence values remain first-class capture content', () => {
    const absences = [
      'unknown-to-user',
      'not-yet-decided',
      'not-applicable',
      'explicitly-absent',
      'declined',
      'deferred',
    ] as const;
    const proposals: CaptureProposal[] = absences.map((absence, index) => ({
      evidence: [userEvidence(absence, index + 1)],
      epistemicStatus: 'inferred',
      confidence: 'medium',
      content: { absence },
    }));

    const result = apply(createEmptyCaptureStoreSnapshot(), { type: 'apply-sweep', proposals });

    expect(result.snapshot.captures.map((capture) => capture.content)).toEqual(
      absences.map((absence) => ({ absence })),
    );
    expect(result.snapshot.captures.every((capture) => 'status' in capture === false)).toBe(true);
  });

  test('harness-invariant: 10 — explicit, inferred, and defaulted remain distinct', () => {
    const proposals: CaptureProposal[] = [
      valueProposal('value-0', userEvidence('evidence-0', 1)),
      valueProposal('value-1', userEvidence('evidence-1', 2), {
        epistemicStatus: 'inferred',
      }),
      {
        basis: { type: 'declared-default', description: 'Default from the target contract.' },
        epistemicStatus: 'defaulted',
        confidence: 'high',
        content: { value: 'value-2' },
      },
    ];

    const result = apply(createEmptyCaptureStoreSnapshot(), { type: 'apply-sweep', proposals });

    expect(result.snapshot.captures.map((capture) => capture.epistemicStatus)).toEqual([
      'explicit',
      'inferred',
      'defaulted',
    ]);
  });

  test('defaulted and external values cite their non-user provenance instead of a user span', () => {
    const proposals: CaptureProposal[] = [
      {
        basis: { type: 'declared-default', description: 'Default from the target contract.' },
        epistemicStatus: 'defaulted',
        confidence: 'high',
        content: { value: 'default value' },
      },
      {
        basis: {
          type: 'documented-transformation',
          description: 'Converted from the external source record.',
        },
        epistemicStatus: 'external-lookup',
        confidence: 'high',
        content: { value: 'looked-up value' },
      },
    ];

    const result = apply(createEmptyCaptureStoreSnapshot(), { type: 'apply-sweep', proposals });
    expect(result.snapshot.captures.map((capture) => capture.epistemicStatus)).toEqual([
      'defaulted',
      'external-lookup',
    ]);

    const userCitedDefault = applyCaptureStoreCommand(result.snapshot, {
      type: 'apply-sweep',
      proposals: [
        {
          ...valueProposal('invalid default'),
          epistemicStatus: 'defaulted',
        } as unknown as CaptureProposal,
      ],
    });
    expect(userCitedDefault).toMatchObject({
      ok: false,
      refusal: { code: 'invalid-envelope' },
    });
  });

  test('harness-invariant: 4 — supersession keeps history and status is derived', () => {
    const original = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [valueProposal('budget = €20,000')],
    });
    const originalId = original.snapshot.captures[0]!.id;
    const corrected = apply(original.snapshot, {
      type: 'apply-sweep',
      proposals: [
        valueProposal('budget = €25,000', userEvidence('Actually €25,000', 2), {
          supersedes: originalId,
        }),
      ],
    });
    const correctionId = corrected.snapshot.captures[1]!.id;

    expect(corrected.snapshot.captures).toHaveLength(2);
    expect(deriveCaptureStatus(corrected.snapshot, originalId)).toBe('superseded');
    expect(deriveCaptureStatus(corrected.snapshot, correctionId)).toBe('active');
    expect(corrected.snapshot.captures.every((capture) => 'status' in capture === false)).toBe(
      true,
    );

    const stale = applyCaptureStoreCommand(corrected.snapshot, {
      type: 'apply-sweep',
      proposals: [
        valueProposal('budget = €30,000', userEvidence('No, €30,000', 3), {
          supersedes: originalId,
        }),
      ],
    });
    expect(stale).toMatchObject({
      ok: false,
      refusal: {
        code: 'superseded-target-not-active',
        targetCaptureId: originalId,
        currentHeadIds: [correctionId],
      },
    });
  });

  test('harness-invariant: 2 — a conflict closes only through a user-cited resolution record', () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [
        valueProposal('launch = March', userEvidence('Launch in March', 1)),
        valueProposal('launch = June', userEvidence('Maybe June', 2), {
          epistemicStatus: 'tentative',
        }),
      ],
    });
    const [marchId, juneId] = captures.snapshot.captures.map((capture) => capture.id);
    const issue = apply(captures.snapshot, {
      type: 'open-issue',
      issueType: 'conflicting',
      origin: { type: 'harness' },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!('issueId' in issue.value)) throw new Error('Opening an issue did not return its id.');
    const issueId = issue.value.issueId;

    expect(
      applyCaptureStoreCommand(issue.snapshot, { type: 'close-issue', issueId }),
    ).toMatchObject({ ok: false, refusal: { code: 'resolution-required' } });
    expect(
      applyCaptureStoreCommand(issue.snapshot, {
        type: 'resolve-conflict',
        issueId,
        decision: 'June wins',
        evidence: [
          {
            ...userEvidence('I suggest June', 3),
            source: 'agent',
          } as unknown as EvidenceSpan,
        ],
        winnerCaptureId: juneId!,
        loserCaptureIds: [marchId!],
      }),
    ).toMatchObject({ ok: false, refusal: { code: 'invalid-resolution' } });
    expect(
      applyCaptureStoreCommand(issue.snapshot, {
        type: 'resolve-conflict',
        issueId,
        decision: 'June wins',
        evidence: [
          {
            ...userEvidence('June', 4),
            source: 'user-affordance-payload',
          },
        ],
        winnerCaptureId: juneId!,
        loserCaptureIds: [marchId!],
      }),
    ).toMatchObject({ ok: false, refusal: { code: 'invalid-resolution' } });

    const resolved = apply(issue.snapshot, {
      type: 'resolve-conflict',
      issueId,
      decision: 'June wins',
      evidence: [userEvidence('Confirmed: June', 4)],
      winnerCaptureId: juneId!,
      loserCaptureIds: [marchId!],
    });

    expect(deriveIssueStatus(resolved.snapshot, issueId)).toBe('closed');
    expect(deriveCaptureStatus(resolved.snapshot, marchId!)).toBe('superseded');
    expect(deriveCaptureStatus(resolved.snapshot, juneId!)).toBe('active');
    expect(resolved.snapshot.issues[0]).not.toHaveProperty('status');
  });

  test('a resolution accounts for every capture named by the conflict', () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [
        valueProposal('March', userEvidence('March', 1)),
        valueProposal('June', userEvidence('June', 2)),
        valueProposal('September', userEvidence('September', 3)),
      ],
    });
    const captureIds = captures.snapshot.captures.map((capture) => capture.id);
    const issue = apply(captures.snapshot, {
      type: 'open-issue',
      issueType: 'conflicting',
      origin: { type: 'harness' },
      references: captureIds,
      canDefault: false,
    });
    if (!('issueId' in issue.value)) throw new Error('Opening an issue did not return its id.');

    const partial = applyCaptureStoreCommand(issue.snapshot, {
      type: 'resolve-conflict',
      issueId: issue.value.issueId,
      decision: 'September wins',
      evidence: [userEvidence('September wins', 4)],
      winnerCaptureId: captureIds[2]!,
      loserCaptureIds: [captureIds[0]!],
    });
    expect(partial).toMatchObject({ ok: false, refusal: { code: 'invalid-resolution' } });
  });

  test('persisted issue-close events cannot silently close a conflict', () => {
    expect(() =>
      parseCaptureStoreSnapshot({
        captures: [],
        issues: [
          {
            id: 'issue-1',
            type: 'conflicting',
            origin: { type: 'harness' },
            references: ['capture-1'],
            canDefault: false,
          },
        ],
        events: [{ id: 'event-1', type: 'issue-closed', issueId: 'issue-1' }],
      }),
    ).toThrow(/conflicting issue/i);
  });

  test('persisted snapshots refuse stale keys and forking supersession graphs', () => {
    const base = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [
        valueProposal('original', userEvidence('original', 1)),
        valueProposal('first correction', userEvidence('first correction', 2)),
        valueProposal('second correction', userEvidence('second correction', 3)),
      ],
    }).snapshot;

    expect(() =>
      parseCaptureStoreSnapshot({
        ...base,
        captures: [{ ...base.captures[0], dedupKey: 'stale-key' }, ...base.captures.slice(1)],
      }),
    ).toThrow(/dedup key/i);

    const originalId = base.captures[0]!.id;
    expect(() =>
      parseCaptureStoreSnapshot({
        ...base,
        captures: [
          base.captures[0],
          { ...base.captures[1], supersedes: originalId },
          { ...base.captures[2], supersedes: originalId },
        ],
      }),
    ).toThrow(/fork/i);
  });

  test('retraction is a user-cited event with no successor', () => {
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: 'apply-sweep',
      proposals: [valueProposal('launch = June')],
    });
    const captureId = created.snapshot.captures[0]!.id;
    expect(
      applyCaptureStoreCommand(created.snapshot, {
        type: 'retract-capture',
        captureId,
        evidence: [
          {
            ...userEvidence('Forget the June date', 2),
            source: 'user-affordance-payload',
          },
        ],
      }),
    ).toMatchObject({ ok: false, refusal: { code: 'invalid-retraction' } });

    const retracted = apply(created.snapshot, {
      type: 'retract-capture',
      captureId,
      evidence: [userEvidence('Forget the June date', 2)],
    });

    expect(deriveCaptureStatus(retracted.snapshot, captureId)).toBe('retracted');
    expect(retracted.snapshot.captures[0]).not.toHaveProperty('status');
    expect(retracted.snapshot.events.at(-1)).toMatchObject({ type: 'retraction', captureId });
    expect(retracted.snapshot.events.at(-1)).not.toHaveProperty('successorCaptureId');
  });
});
