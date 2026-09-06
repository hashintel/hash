import { beforeEach, describe, expect, test } from "vitest";

import {
  ABSENCE_STATES,
  applyCaptureStoreCommand as applyCaptureStoreCommandWithArchive,
  createEmptyCaptureStoreSnapshot,
  deriveCaptureStatus,
  deriveIssueStatus,
  parseCaptureStoreSnapshot,
  type CaptureInputProposal,
  type CaptureStoreCommand,
  type CaptureStoreSnapshot,
  type EvidenceSpan,
} from "../src/evidence/capture-store";
import {
  archiveSessionLogRead,
  createEmptySessionLogArchive,
  type EvidenceQuote,
} from "../src/evidence/session-log";

const excerptsByEntry = new Map<number, Set<string>>();

beforeEach(() => excerptsByEntry.clear());

const userEvidence = (excerpt: string, entry = 1): EvidenceQuote => {
  const excerpts = excerptsByEntry.get(entry) ?? new Set<string>();
  excerpts.add(excerpt);
  excerptsByEntry.set(entry, excerpts);
  return { excerpt };
};

const storedEvidence = (excerpt: string, entry = 1): EvidenceSpan => ({
  excerpt,
  pointer: { sessionId: "session-1", entryStart: entry, entryEnd: entry },
  source: "user",
});

const evidenceArchive = () => {
  const maxEntry = Math.max(1, ...excerptsByEntry.keys());
  return archiveSessionLogRead(createEmptySessionLogArchive(), {
    sessionId: "session-1",
    offset: String(maxEntry),
    entries: Array.from({ length: maxEntry }, (_, index) => {
      const ordinal = index + 1;
      const text = [
        ...(excerptsByEntry.get(ordinal) ?? [`filler-${ordinal}`]),
      ].join("\n");
      return {
        substrateEntryId: `message-${ordinal}`,
        kind: "user" as const,
        text,
        materialized: { id: `message-${ordinal}`, text },
      };
    }),
    settlements: [],
  });
};

const applyCaptureStoreCommand = (
  snapshot: CaptureStoreSnapshot,
  command: CaptureStoreCommand,
) =>
  applyCaptureStoreCommandWithArchive(snapshot, command, {
    sessionId: "session-1",
    archive: evidenceArchive(),
  });

type UserCaptureProposal = Extract<
  CaptureInputProposal,
  { readonly evidence: readonly EvidenceQuote[] }
>;

const valueProposal = (
  value: string,
  evidence = userEvidence(value),
  overrides: Partial<Omit<UserCaptureProposal, "content" | "evidence">> = {},
): UserCaptureProposal => ({
  evidence: [evidence],
  epistemicStatus: "explicit",
  confidence: "high",
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
  // The closure property, checked on every command this suite accepts rather
  // than on a chosen few: what a command returns has to survive the trip
  // through the file it will be kept in, and come back the same snapshot. The
  // JSON hop is part of the property — persistence goes through JSON, so a
  // value the command surface accepts and JSON cannot carry is a snapshot the
  // next read cannot reproduce.
  expect(
    parseCaptureStoreSnapshot(JSON.parse(JSON.stringify(result.snapshot))),
  ).toEqual(result.snapshot);
  return result;
};

describe("capture-store contract", () => {
  test("harness-invariant: 5 — retries deduplicate by evidence and content, not epistemic status", () => {
    const proposal = valueProposal("budget = €20,000");
    const first = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [proposal],
    });
    const retry = apply(first.snapshot, {
      type: "apply-sweep",
      proposals: [{ ...proposal, epistemicStatus: "tentative" }],
    });

    expect(first.snapshot.captures).toHaveLength(1);
    expect(retry.snapshot.captures).toHaveLength(1);
    expect(retry.value).toEqual({
      appliedCaptureIds: [],
      skippedDedupKeys: [first.snapshot.captures[0]!.dedupKey],
      advisories: [],
    });

    const originalId = retry.snapshot.captures[0]!.id;
    const revisedReading = apply(retry.snapshot, {
      type: "apply-sweep",
      proposals: [
        { ...proposal, epistemicStatus: "tentative", supersedes: originalId },
      ],
    });
    expect(revisedReading.snapshot.captures).toHaveLength(2);
    expect(revisedReading.snapshot.captures[1]).toMatchObject({
      dedupKey: first.snapshot.captures[0]!.dedupKey,
      epistemicStatus: "tentative",
      supersedes: originalId,
    });
  });

  test("a negative-zero capture value is refused, not silently flattened to zero", () => {
    // JSON.stringify(-0) is "0", so accepting -0 mints a snapshot whose read
    // path returns a different number than the command accepted — found by the
    // round-trip property's JSON hop.
    const result = applyCaptureStoreCommand(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        {
          evidence: [userEvidence("minus zero", 1)],
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: -0 },
        },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ refusal: { code: "invalid-envelope" } });

    const nested = applyCaptureStoreCommand(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        {
          evidence: [userEvidence("nested minus zero", 1)],
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: { offset: -0 } },
        },
      ],
    });
    expect(nested.ok).toBe(false);
  });

  test("same-evidence and near-identical active values surface ephemeral equivalence advisories", () => {
    const sharedEvidence = userEvidence("The launch is June.", 1);
    const result = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("launch = June", sharedEvidence),
        valueProposal("release = June", sharedEvidence),
        valueProposal(
          "  LAUNCH   = june ",
          userEvidence("June is the launch month.", 2),
        ),
      ],
    });
    if (!("appliedCaptureIds" in result.value))
      throw new Error("A sweep did not return advisories.");

    expect(
      result.value.advisories
        .filter((advisory) => advisory.type === "possibly-equivalent")
        .map((advisory) => advisory.reason)
        .sort(),
    ).toEqual(["near-identical-payload", "same-evidence"]);
    expect(result.snapshot.events).toEqual([]);
  });

  test("harness-invariant: 7 — one invalid proposal refuses the whole sweep", () => {
    const before = createEmptyCaptureStoreSnapshot();
    const result = applyCaptureStoreCommand(before, {
      type: "apply-sweep",
      proposals: [
        valueProposal("valid"),
        {
          evidence: [userEvidence("invalid", 2)],
          epistemicStatus: "explicit",
          confidence: "high",
          content: { value: "value", absence: "deferred" },
        } as unknown as CaptureInputProposal,
      ],
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ refusal: { code: "invalid-envelope" } });
    expect(before).toEqual(createEmptyCaptureStoreSnapshot());
  });

  test("harness-invariant: 9 — all six absence values remain first-class capture content", () => {
    const proposals: CaptureInputProposal[] = ABSENCE_STATES.map(
      (absence, index) => ({
        evidence: [userEvidence(absence, index + 1)],
        epistemicStatus: "inferred",
        confidence: "medium",
        content: { absence },
      }),
    );

    const result = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals,
    });

    expect(result.snapshot.captures.map((capture) => capture.content)).toEqual(
      ABSENCE_STATES.map((absence) => ({ absence })),
    );
    expect(
      result.snapshot.captures.every(
        (capture) => "status" in capture === false,
      ),
    ).toBe(true);
  });

  test("harness-invariant: 10 — explicit, inferred, and defaulted remain distinct", () => {
    const proposals: CaptureInputProposal[] = [
      valueProposal("value-0", userEvidence("evidence-0", 1)),
      valueProposal("value-1", userEvidence("evidence-1", 2), {
        epistemicStatus: "inferred",
      }),
      {
        basis: {
          type: "declared-default",
          description: "Default from the target contract.",
        },
        epistemicStatus: "defaulted",
        confidence: "high",
        content: { value: "value-2" },
      },
    ];

    const result = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals,
    });

    expect(
      result.snapshot.captures.map((capture) => capture.epistemicStatus),
    ).toEqual(["explicit", "inferred", "defaulted"]);
  });

  test("defaulted and external values cite their non-user provenance instead of a user span", () => {
    const proposals: CaptureInputProposal[] = [
      {
        basis: {
          type: "declared-default",
          description: "Default from the target contract.",
        },
        epistemicStatus: "defaulted",
        confidence: "high",
        content: { value: "default value" },
      },
      {
        basis: {
          type: "documented-transformation",
          description: "Converted from the external source record.",
        },
        epistemicStatus: "external-lookup",
        confidence: "high",
        content: { value: "looked-up value" },
      },
    ];

    const result = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals,
    });
    expect(
      result.snapshot.captures.map((capture) => capture.epistemicStatus),
    ).toEqual(["defaulted", "external-lookup"]);

    const userCitedDefault = applyCaptureStoreCommand(result.snapshot, {
      type: "apply-sweep",
      proposals: [
        {
          ...valueProposal("invalid default"),
          epistemicStatus: "defaulted",
        } as unknown as CaptureInputProposal,
      ],
    });
    expect(userCitedDefault).toMatchObject({
      ok: false,
      refusal: { code: "invalid-envelope" },
    });
  });

  test("harness-invariant: 4 — supersession keeps history and status is derived", () => {
    const original = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [valueProposal("budget = €20,000")],
    });
    const originalId = original.snapshot.captures[0]!.id;
    const corrected = apply(original.snapshot, {
      type: "apply-sweep",
      proposals: [
        valueProposal("budget = €25,000", userEvidence("Actually €25,000", 2), {
          supersedes: originalId,
        }),
      ],
    });
    const correctionId = corrected.snapshot.captures[1]!.id;

    expect(corrected.snapshot.captures).toHaveLength(2);
    expect(deriveCaptureStatus(corrected.snapshot, originalId)).toBe(
      "superseded",
    );
    expect(deriveCaptureStatus(corrected.snapshot, correctionId)).toBe(
      "active",
    );
    expect(
      corrected.snapshot.captures.every(
        (capture) => "status" in capture === false,
      ),
    ).toBe(true);

    const stale = applyCaptureStoreCommand(corrected.snapshot, {
      type: "apply-sweep",
      proposals: [
        valueProposal("budget = €30,000", userEvidence("No, €30,000", 3), {
          supersedes: originalId,
        }),
      ],
    });
    expect(stale).toMatchObject({
      ok: false,
      refusal: {
        code: "superseded-target-not-active",
        targetCaptureId: originalId,
        currentHeadIds: [correctionId],
      },
    });
  });

  test("harness-invariant: 2 — a conflict closes only through a user-cited resolution record", () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("launch = March", userEvidence("Launch in March", 1)),
        valueProposal("launch = June", userEvidence("Maybe June", 2), {
          epistemicStatus: "tentative",
        }),
      ],
    });
    const [marchId, juneId] = captures.snapshot.captures.map(
      (capture) => capture.id,
    );
    const issue = apply(captures.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");
    const issueId = issue.value.issueId;

    expect(
      applyCaptureStoreCommand(issue.snapshot, {
        type: "close-issue",
        issueId,
      }),
    ).toMatchObject({ ok: false, refusal: { code: "resolution-required" } });
    expect(
      applyCaptureStoreCommand(issue.snapshot, {
        type: "resolve-conflict",
        issueId,
        decision: "June wins",
        evidence: [
          {
            ...userEvidence("I suggest June", 3),
            source: "agent",
          } as unknown as EvidenceQuote,
        ],
        winnerCaptureId: juneId!,
        loserCaptureIds: [marchId!],
      }),
    ).toMatchObject({ ok: false, refusal: { code: "invalid-resolution" } });
    expect(
      applyCaptureStoreCommand(issue.snapshot, {
        type: "resolve-conflict",
        issueId,
        decision: "June wins",
        evidence: [
          {
            ...userEvidence("June", 4),
            source: "user-affordance-payload",
          } as unknown as EvidenceQuote,
        ],
        winnerCaptureId: juneId!,
        loserCaptureIds: [marchId!],
      }),
    ).toMatchObject({ ok: false, refusal: { code: "invalid-resolution" } });

    const resolved = apply(issue.snapshot, {
      type: "resolve-conflict",
      issueId,
      decision: "June wins",
      evidence: [userEvidence("Confirmed: June", 4)],
      winnerCaptureId: juneId!,
      loserCaptureIds: [marchId!],
    });

    expect(deriveIssueStatus(resolved.snapshot, issueId)).toBe("closed");
    expect(deriveCaptureStatus(resolved.snapshot, marchId!)).toBe("superseded");
    expect(deriveCaptureStatus(resolved.snapshot, juneId!)).toBe("active");
    expect(resolved.snapshot.issues[0]).not.toHaveProperty("status");
  });

  test("a resolution accounts for every capture named by the conflict", () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
        valueProposal("September", userEvidence("September", 3)),
      ],
    });
    const captureIds = captures.snapshot.captures.map((capture) => capture.id);
    const issue = apply(captures.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: captureIds,
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");

    const partial = applyCaptureStoreCommand(issue.snapshot, {
      type: "resolve-conflict",
      issueId: issue.value.issueId,
      decision: "September wins",
      evidence: [userEvidence("September wins", 4)],
      winnerCaptureId: captureIds[2]!,
      loserCaptureIds: [captureIds[0]!],
    });
    expect(partial).toMatchObject({
      ok: false,
      refusal: { code: "invalid-resolution" },
    });
  });

  test("persisted issue-close events cannot silently close a conflict", () => {
    expect(() =>
      parseCaptureStoreSnapshot({
        captures: [],
        issues: [
          {
            id: "issue-1",
            type: "conflicting",
            origin: { type: "harness" },
            // Two references, and the assertion names the rule it means: with
            // one reference this fixture is refused for referencing too few
            // captures, and would have gone green without reaching the
            // issue-closed rule at all.
            references: ["capture-1", "capture-2"],
            canDefault: false,
          },
        ],
        events: [{ id: "event-1", type: "issue-closed", issueId: "issue-1" }],
      }),
    ).toThrow(/without a resolution record/i);
  });

  test("persisted snapshots refuse more than one closing event for an issue", () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [valueProposal("March", userEvidence("March", 1))],
    }).snapshot;
    const captureId = captures.captures[0]!.id;
    const issue = apply(captures, {
      type: "open-issue",
      issueType: "ambiguous",
      origin: { type: "harness" },
      references: [captureId],
      canDefault: true,
    }).snapshot;
    const closed = apply(issue, {
      type: "close-issue",
      issueId: issue.issues[0]!.id,
    }).snapshot;

    expect(() => parseCaptureStoreSnapshot(closed)).not.toThrow();
    expect(() =>
      parseCaptureStoreSnapshot({
        ...closed,
        events: [
          ...closed.events,
          {
            id: "event-duplicate-close",
            type: "issue-closed",
            issueId: issue.issues[0]!.id,
          },
        ],
      }),
    ).toThrow(/more than one closing event/i);
  });

  test("persisted snapshots refuse stale keys and forking supersession graphs", () => {
    const base = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("original", userEvidence("original", 1)),
        valueProposal("first correction", userEvidence("first correction", 2)),
        valueProposal(
          "second correction",
          userEvidence("second correction", 3),
        ),
      ],
    }).snapshot;

    expect(() =>
      parseCaptureStoreSnapshot({
        ...base,
        captures: [
          { ...base.captures[0], dedupKey: "stale-key" },
          ...base.captures.slice(1),
        ],
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

  test("open-issue refuses every issue the persisted contract would reject", () => {
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [valueProposal("launch = June")],
    });
    const captureId = created.snapshot.captures[0]!.id;
    const wellFormed = {
      type: "open-issue",
      issueType: "ambiguous",
      origin: { type: "harness" },
      references: [captureId],
      canDefault: false,
    } as const;

    for (const [reason, overrides] of [
      ["an issue type outside the vocabulary", { issueType: "nonsense" }],
      ["a plugin origin naming no producer", { origin: { type: "plugin" } }],
      [
        "a plugin origin whose namespace is empty",
        { origin: { type: "plugin", namespace: "" } },
      ],
      ["no references at all", { references: [] }],
      [
        "the same capture referenced twice",
        { references: [captureId, captureId] },
      ],
      [
        "a reference to a capture that does not exist",
        { references: ["capture-missing"] },
      ],
      ["a non-boolean can-default", { canDefault: "yes" }],
    ] as const) {
      const result = applyCaptureStoreCommand(created.snapshot, {
        ...wellFormed,
        ...overrides,
      } as unknown as Parameters<typeof applyCaptureStoreCommand>[1]);
      expect({
        reason,
        refused: !result.ok,
        code: result.ok ? undefined : result.refusal.code,
      }).toEqual({ reason, refused: true, code: "invalid-envelope" });
    }

    // The positive control: the same command without an override is accepted,
    // so the table is refusing the overrides and not the shape they start from.
    expect(apply(created.snapshot, wellFormed).snapshot.issues).toHaveLength(1);
  });

  test("a conflicting issue opens only over two or more distinct active captures", () => {
    // Every refusal here is a conflict that could never have closed. Closing a
    // conflict takes a resolution; a resolution cites a winner and at least one
    // loser, all still active, and exactly the issue's reference set. A single
    // reference cannot equal a set of two or more, and a superseded or retracted
    // reference fails the activity rule no matter who is cited.
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
        valueProposal("September", userEvidence("September", 3)),
      ],
    });
    const [marchId, juneId, septemberId] = created.snapshot.captures.map(
      (capture) => capture.id,
    );
    // March is superseded by a correction; September is retracted.
    const corrected = apply(created.snapshot, {
      type: "apply-sweep",
      proposals: [
        valueProposal("April", userEvidence("Actually April", 4), {
          supersedes: marchId!,
        }),
      ],
    });
    const withRetraction = apply(corrected.snapshot, {
      type: "retract-capture",
      captureId: septemberId!,
      evidence: [userEvidence("Forget September", 5)],
    });
    const aprilId = corrected.snapshot.captures.at(-1)!.id;
    const openConflict = (references: readonly string[]) =>
      applyCaptureStoreCommand(withRetraction.snapshot, {
        type: "open-issue",
        issueType: "conflicting",
        origin: { type: "harness" },
        references,
        canDefault: false,
      });

    for (const [reason, references, expectedMessage] of [
      [
        "a conflict of one capture",
        [juneId!],
        /conflicting issue needs at least two/i,
      ],
      [
        "a conflict naming a superseded capture",
        [juneId!, marchId!],
        /active captures.*superseded/i,
      ],
      [
        "a conflict naming a retracted capture",
        [juneId!, septemberId!],
        /active captures.*retracted/i,
      ],
    ] as const) {
      const result = openConflict(references);
      expect({
        reason,
        refused: !result.ok,
        code: result.ok ? undefined : result.refusal.code,
        message: result.ok ? undefined : result.refusal.message,
      }).toEqual({
        reason,
        refused: true,
        code: "invalid-envelope",
        // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any.
        message: expect.stringMatching(expectedMessage),
      });
    }

    // The positive control, and the reason the rule is worth having: a conflict
    // over two active captures opens and then closes.
    const issue = apply(withRetraction.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [juneId!, aprilId],
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");
    const resolved = apply(issue.snapshot, {
      type: "resolve-conflict",
      issueId: issue.value.issueId,
      decision: "June wins",
      evidence: [userEvidence("Confirmed: June", 6)],
      winnerCaptureId: juneId!,
      loserCaptureIds: [aprilId],
    });
    expect(deriveIssueStatus(resolved.snapshot, issue.value.issueId)).toBe(
      "closed",
    );

    // A non-conflicting issue is untouched by either rule: one reference is a
    // complete population, and close-issue can always close it.
    const ambiguous = apply(withRetraction.snapshot, {
      type: "open-issue",
      issueType: "ambiguous",
      origin: { type: "harness" },
      references: [marchId!],
      canDefault: true,
    });
    if (!("issueId" in ambiguous.value))
      throw new Error("Opening an issue did not return its id.");
    const closed = apply(ambiguous.snapshot, {
      type: "close-issue",
      issueId: ambiguous.value.issueId,
    });
    expect(deriveIssueStatus(closed.snapshot, ambiguous.value.issueId)).toBe(
      "closed",
    );
  });

  test("open conflicts stay pairwise disjoint so every conflict keeps a legal closing path", () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
        valueProposal("September", userEvidence("September", 3)),
        valueProposal("December", userEvidence("December", 4)),
      ],
    });
    const [marchId, juneId, septemberId, decemberId] =
      captures.snapshot.captures.map((capture) => capture.id);
    const first = apply(captures.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });

    for (const [reason, references] of [
      ["shares the first capture", [marchId!, septemberId!]],
      ["shares the second capture", [juneId!, septemberId!]],
      ["contains the first conflict", [marchId!, juneId!, septemberId!]],
    ] as const) {
      const result = applyCaptureStoreCommand(first.snapshot, {
        type: "open-issue",
        issueType: "conflicting",
        origin: { type: "harness" },
        references,
        canDefault: false,
      });
      expect({
        reason,
        refused: !result.ok,
        code: result.ok ? undefined : result.refusal.code,
        message: result.ok ? undefined : result.refusal.message,
      }).toEqual({
        reason,
        refused: true,
        code: "invalid-envelope",
        // oxlint-disable-next-line typescript/no-unsafe-assignment -- Vitest asymmetric matchers are typed as any.
        message: expect.stringMatching(/open conflict.*share/i),
      });
    }

    const disjoint = apply(first.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [septemberId!, decemberId!],
      canDefault: false,
    });
    expect(disjoint.snapshot.issues).toHaveLength(2);

    expect(() =>
      parseCaptureStoreSnapshot({
        ...first.snapshot,
        issues: [
          ...first.snapshot.issues,
          {
            id: "issue-overlap",
            type: "conflicting",
            origin: { type: "harness" },
            references: [juneId!, septemberId!],
            canDefault: false,
          },
        ],
      }),
    ).toThrow(/open conflict.*share/i);

    // The command surface pins these captures, but a persisted snapshot could
    // have been edited or written by an older producer. The read boundary must
    // enforce the same closure property instead of reviving an unresolvable
    // open conflict.
    expect(() =>
      parseCaptureStoreSnapshot({
        ...first.snapshot,
        events: [
          ...first.snapshot.events,
          {
            id: "event-illegal-retraction",
            type: "retraction",
            captureId: marchId!,
            evidence: [storedEvidence("Forget March", 5)],
          },
        ],
      }),
    ).toThrow(/open conflict.*inactive capture/i);
  });

  test("an unresolved conflict pins its captures against supersession and retraction", () => {
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
        // Named by no conflict, so it stays free to correct and retract — the
        // guard pins the disputed captures, not the store.
        valueProposal("Venue", userEvidence("Venue is the hall", 3)),
      ],
    });
    const [marchId, juneId, venueId] = captures.snapshot.captures.map(
      (capture) => capture.id,
    );
    const issue = apply(captures.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");
    const issueId = issue.value.issueId;

    for (const [attempt, command] of [
      [
        "superseding the March side",
        {
          type: "apply-sweep",
          proposals: [
            valueProposal("April", userEvidence("Actually April", 4), {
              supersedes: marchId!,
            }),
          ],
        },
      ],
      [
        "superseding the June side",
        {
          type: "apply-sweep",
          proposals: [
            valueProposal("July", userEvidence("Actually July", 5), {
              supersedes: juneId!,
            }),
          ],
        },
      ],
      [
        "retracting the March side",
        {
          type: "retract-capture",
          captureId: marchId!,
          evidence: [userEvidence("Forget it", 6)],
        },
      ],
      [
        "retracting the June side",
        {
          type: "retract-capture",
          captureId: juneId!,
          evidence: [userEvidence("Forget it", 7)],
        },
      ],
    ] as const) {
      const result = applyCaptureStoreCommand(issue.snapshot, command);
      expect({
        attempt,
        refused: !result.ok,
        code: result.ok ? undefined : result.refusal.code,
        blocking: result.ok
          ? undefined
          : "blockingIssueIds" in result.refusal
            ? result.refusal.blockingIssueIds
            : undefined,
      }).toEqual({
        attempt,
        refused: true,
        code: "blocked-by-open-conflict",
        blocking: [issueId],
      });
    }

    // A capture no conflict names is unaffected.
    expect(
      apply(issue.snapshot, {
        type: "retract-capture",
        captureId: venueId!,
        evidence: [userEvidence("Not the hall after all", 8)],
      }).snapshot.events,
    ).toHaveLength(1);

    // And the pin lifts once the conflict closes the one way it can: the loser
    // is superseded by the resolution itself, and the winner is free again.
    const resolved = apply(issue.snapshot, {
      type: "resolve-conflict",
      issueId,
      decision: "June wins",
      evidence: [userEvidence("Confirmed: June", 9)],
      winnerCaptureId: juneId!,
      loserCaptureIds: [marchId!],
    });
    expect(deriveCaptureStatus(resolved.snapshot, marchId!)).toBe("superseded");
    expect(
      apply(resolved.snapshot, {
        type: "retract-capture",
        captureId: juneId!,
        evidence: [userEvidence("Forget June too", 10)],
      }).snapshot.events,
    ).toHaveLength(2);
  });

  test("a persisted conflicting issue of one capture is not readable", () => {
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
      ],
    });
    const [marchId, juneId] = created.snapshot.captures.map(
      (capture) => capture.id,
    );
    const issue = apply(created.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    }).snapshot;

    expect(() => parseCaptureStoreSnapshot(issue)).not.toThrow();
    expect(() =>
      parseCaptureStoreSnapshot({
        ...issue,
        issues: [{ ...issue.issues[0]!, references: [marchId!] }],
      }),
    ).toThrow(/at least two captures/i);
  });

  test("a resolution accounts for its conflict by set equality, not by count and membership", () => {
    // The combination the old pair admitted: an issue referencing one capture
    // twice, and a resolution citing two — equal in length, every reference
    // present among the cited, and the cited distinct. Unique references make
    // the issue unrepresentable at both surfaces, which is the point.
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
      ],
    });
    const [marchId, juneId] = captures.snapshot.captures.map(
      (capture) => capture.id,
    );
    const issue = apply(captures.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");
    const resolved = apply(issue.snapshot, {
      type: "resolve-conflict",
      issueId: issue.value.issueId,
      decision: "June wins",
      evidence: [userEvidence("Confirmed: June", 3)],
      winnerCaptureId: juneId!,
      loserCaptureIds: [marchId!],
    }).snapshot;

    expect(() => parseCaptureStoreSnapshot(resolved)).not.toThrow();
    expect(() =>
      parseCaptureStoreSnapshot({
        ...resolved,
        issues: [{ ...resolved.issues[0]!, references: [marchId!, marchId!] }],
      }),
    ).toThrow(/distinct/i);
  });

  test("a command stores its own copy of the evidence and ids the caller passed", () => {
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
      ],
    });
    const [marchId, juneId] = created.snapshot.captures.map(
      (capture) => capture.id,
    );
    const issue = apply(created.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");

    const resolutionEvidence = [userEvidence("Confirmed: June", 3)];
    const losers = [marchId!];
    const resolved = apply(issue.snapshot, {
      type: "resolve-conflict",
      issueId: issue.value.issueId,
      decision: "June wins",
      evidence: resolutionEvidence,
      winnerCaptureId: juneId!,
      loserCaptureIds: losers,
    });
    const retractionEvidence = [userEvidence("Forget June too", 4)];
    const retracted = apply(resolved.snapshot, {
      type: "retract-capture",
      captureId: juneId!,
      evidence: retractionEvidence,
    });

    // Everything the caller still holds, edited after the store accepted it.
    (resolutionEvidence[0] as { excerpt: string }).excerpt =
      "Mutated resolution quote";
    resolutionEvidence.push(userEvidence("Injected into the resolution", 5));
    losers.push("capture-injected");
    (retractionEvidence[0] as { excerpt: string }).excerpt =
      "Mutated retraction quote";
    retractionEvidence.push(userEvidence("Injected into the retraction", 6));

    const resolution = retracted.snapshot.events.find(
      (event) => event.type === "resolution",
    );
    const retraction = retracted.snapshot.events.find(
      (event) => event.type === "retraction",
    );
    if (
      resolution?.type !== "resolution" ||
      retraction?.type !== "retraction"
    ) {
      throw new Error("The store did not record both events.");
    }
    expect({
      resolutionEvidence: resolution.evidence,
      loserCaptureIds: resolution.loserCaptureIds,
      retractionEvidence: retraction.evidence,
    }).toEqual({
      resolutionEvidence: [storedEvidence("Confirmed: June", 3)],
      loserCaptureIds: [marchId!],
      retractionEvidence: [storedEvidence("Forget June too", 4)],
    });
    // And the snapshot the caller could still reach is one the parser accepts.
    expect(() => parseCaptureStoreSnapshot(retracted.snapshot)).not.toThrow();
  });

  test("a caller-supplied evidence range is refused at every evidence command surface", () => {
    const reversed: EvidenceSpan = {
      excerpt: "Reversed range",
      pointer: { sessionId: "session-1", entryStart: 5, entryEnd: 4 },
      source: "user",
    };
    const captures = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
        // Outside the conflict opened below, so the retraction row is refused
        // for its reversed span rather than by the open-conflict guard.
        valueProposal("September", userEvidence("September", 3)),
      ],
    });
    const [marchId, juneId, septemberId] = captures.snapshot.captures.map(
      (capture) => capture.id,
    );
    const issue = apply(captures.snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!("issueId" in issue.value))
      throw new Error("Opening an issue did not return its id.");

    for (const [surface, command, code] of [
      [
        "apply-sweep",
        {
          type: "apply-sweep",
          proposals: [
            valueProposal("reversed", reversed as unknown as EvidenceQuote),
          ],
        },
        "invalid-envelope",
      ],
      [
        "resolve-conflict",
        {
          type: "resolve-conflict",
          issueId: issue.value.issueId,
          decision: "June wins",
          evidence: [reversed as unknown as EvidenceQuote],
          winnerCaptureId: juneId!,
          loserCaptureIds: [marchId!],
        },
        "invalid-resolution",
      ],
      [
        "retract-capture",
        {
          type: "retract-capture",
          captureId: septemberId!,
          evidence: [reversed as unknown as EvidenceQuote],
        },
        "invalid-retraction",
      ],
    ] as const) {
      const result = applyCaptureStoreCommand(issue.snapshot, command);
      expect({
        surface,
        refused: !result.ok,
        code: result.ok ? undefined : result.refusal.code,
      }).toEqual({ surface, refused: true, code });
    }
  });

  test("persisted snapshots refuse a reversed evidence range in a capture or an event", () => {
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [valueProposal("launch = June")],
    });
    const retracted = apply(created.snapshot, {
      type: "retract-capture",
      captureId: created.snapshot.captures[0]!.id,
      evidence: [userEvidence("Forget the June date", 2)],
    }).snapshot;

    // Bent from a snapshot the store itself produced, so the reversed range is
    // the only thing wrong with what the parser is handed.
    type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };
    type EvidenceBearing = {
      evidence: Array<{ pointer: Mutable<EvidenceSpan["pointer"]> }>;
    };
    const withReversedRange = (family: "captures" | "events"): unknown => {
      const clone = structuredClone(retracted) as unknown as Record<
        string,
        EvidenceBearing[]
      >;
      const span = clone[family]![0]!.evidence[0]!;
      span.pointer = { ...span.pointer, entryStart: 5, entryEnd: 4 };
      return clone;
    };

    expect(() => parseCaptureStoreSnapshot(retracted)).not.toThrow();
    expect(() =>
      parseCaptureStoreSnapshot(withReversedRange("captures")),
    ).toThrow(/range/i);
    expect(() =>
      parseCaptureStoreSnapshot(withReversedRange("events")),
    ).toThrow(/range/i);
  });

  test("every command type round-trips its accepted result through persisted parsing", () => {
    // `apply` checks the round-trip on every command the suite accepts, so this
    // test does not repeat the check — it pins the *coverage*: that a script
    // exists exercising each command type, and that the set is complete. The
    // `Record<CaptureStoreCommand['type'], …>` annotation is what keeps it
    // complete: a sixth command will not typecheck until it appears here.
    const exercised: Record<CaptureStoreCommand["type"], boolean> = {
      "apply-sweep": false,
      "open-issue": false,
      "close-issue": false,
      "resolve-conflict": false,
      "retract-capture": false,
    };

    let snapshot = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [
        valueProposal("March", userEvidence("March", 1)),
        valueProposal("June", userEvidence("June", 2)),
        valueProposal("Venue", userEvidence("Venue is the hall", 3)),
        {
          basis: {
            type: "declared-default",
            description: "Default from the target contract.",
          },
          epistemicStatus: "defaulted",
          confidence: "high",
          content: { absence: "not-yet-decided" },
        },
      ],
    }).snapshot;
    exercised["apply-sweep"] = true;
    const [marchId, juneId, venueId] = snapshot.captures.map(
      (capture) => capture.id,
    );

    // A supersession, so the round-trip covers a capture carrying `supersedes`
    // and a snapshot with a supersession link in it.
    snapshot = apply(snapshot, {
      type: "apply-sweep",
      proposals: [
        valueProposal("The garden", userEvidence("Actually the garden", 4), {
          supersedes: venueId!,
          alternativeGroup: "venue",
        }),
      ],
    }).snapshot;

    const ambiguous = apply(snapshot, {
      type: "open-issue",
      issueType: "ambiguous",
      origin: { type: "plugin", namespace: "gherkin" },
      references: [marchId!],
      canDefault: true,
    });
    exercised["open-issue"] = true;
    if (!("issueId" in ambiguous.value))
      throw new Error("Opening an issue did not return its id.");
    snapshot = apply(ambiguous.snapshot, {
      type: "close-issue",
      issueId: ambiguous.value.issueId,
    }).snapshot;
    exercised["close-issue"] = true;

    const conflict = apply(snapshot, {
      type: "open-issue",
      issueType: "conflicting",
      origin: { type: "harness" },
      references: [marchId!, juneId!],
      canDefault: false,
    });
    if (!("issueId" in conflict.value))
      throw new Error("Opening an issue did not return its id.");
    snapshot = apply(conflict.snapshot, {
      type: "resolve-conflict",
      issueId: conflict.value.issueId,
      decision: "June wins",
      evidence: [userEvidence("Confirmed: June", 5)],
      winnerCaptureId: juneId!,
      loserCaptureIds: [marchId!],
    }).snapshot;
    exercised["resolve-conflict"] = true;

    snapshot = apply(snapshot, {
      type: "retract-capture",
      captureId: juneId!,
      evidence: [userEvidence("Forget June too", 6)],
    }).snapshot;
    exercised["retract-capture"] = true;

    const unexercised = Object.entries(exercised)
      .filter(([, seen]) => !seen)
      .map(([type]) => type);
    expect(unexercised).toEqual([]);
    // The whole accumulated history, not only the last step's addition.
    expect(
      parseCaptureStoreSnapshot(JSON.parse(JSON.stringify(snapshot))),
    ).toEqual(snapshot);
    expect({
      captures: snapshot.captures.length,
      issues: snapshot.issues.length,
      events: snapshot.events.length,
    }).toEqual({ captures: 5, issues: 2, events: 3 });
  });

  test("retraction is a user-cited event with no successor", () => {
    const created = apply(createEmptyCaptureStoreSnapshot(), {
      type: "apply-sweep",
      proposals: [valueProposal("launch = June")],
    });
    const captureId = created.snapshot.captures[0]!.id;
    expect(
      applyCaptureStoreCommand(created.snapshot, {
        type: "retract-capture",
        captureId,
        evidence: [
          {
            ...userEvidence("Forget the June date", 2),
            source: "user-affordance-payload",
          } as unknown as EvidenceQuote,
        ],
      }),
    ).toMatchObject({ ok: false, refusal: { code: "invalid-retraction" } });

    const retracted = apply(created.snapshot, {
      type: "retract-capture",
      captureId,
      evidence: [userEvidence("Forget the June date", 2)],
    });

    expect(deriveCaptureStatus(retracted.snapshot, captureId)).toBe(
      "retracted",
    );
    expect(retracted.snapshot.captures[0]).not.toHaveProperty("status");
    expect(retracted.snapshot.events.at(-1)).toMatchObject({
      type: "retraction",
      captureId,
    });
    expect(retracted.snapshot.events.at(-1)).not.toHaveProperty(
      "successorCaptureId",
    );
  });
});
