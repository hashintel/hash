import { describe, expect, test } from "vitest";

import {
  advanceSweepHighWater,
  buildSettlementCheckSignal,
  buildSweepRepairSignal,
  buildSweepExtractionPrompt,
  computeUnaccountedAskAdvisories,
  createInitialSweepState,
  decideSettlementTrigger,
  parseSweepState,
  pendingSweepRepair,
  reopenSweepAfterRefusal,
  settlementProtocolInstructionFragments,
  sweepableRange,
  unsweptTail,
  type SweepSessionEntry,
} from "../src/sweep-protocol";

const entries: readonly SweepSessionEntry[] = [
  {
    id: "assistant-ask",
    kind: "assistant",
    text: "",
    affordances: [{ id: "affordance-1", markdown: "What outcome matters?" }],
  },
  {
    id: "user-reply",
    kind: "user-affordance-payload",
    text: "A shopper completes checkout.",
    replyToAffordanceId: "affordance-1",
  },
  {
    id: "reply-binding",
    kind: "non-user",
    text: "Harness reply binding.",
  },
];

describe("settlement and sweep protocol", () => {
  test("keeps the high-water and loop guard in one parse-checked sweep state", () => {
    const initial = createInitialSweepState();
    expect(initial).toEqual({
      sweptThroughUserEntryId: null,
      lastCheckedUserEntryId: null,
    });
    expect(parseSweepState(initial)).toEqual(initial);
    expect(() => parseSweepState({ ...initial, invented: true })).toThrow(
      Error,
    );
  });

  test("computes the unswept range through the latest true-user entry only", () => {
    expect(unsweptTail(entries, createInitialSweepState())).toEqual(
      entries.slice(0, 2),
    );

    const swept = advanceSweepHighWater(
      createInitialSweepState(),
      "user-reply",
    );
    expect(parseSweepState(swept)).toEqual({
      sweptThroughUserEntryId: "user-reply",
      lastCheckedUserEntryId: "user-reply",
    });
    expect(unsweptTail(entries, swept)).toEqual([]);
    expect(sweepableRange(entries)).toEqual(entries.slice(0, 2));

    expect(() =>
      unsweptTail(entries, {
        sweptThroughUserEntryId: "missing-entry",
        lastCheckedUserEntryId: null,
      }),
    ).toThrow(/high-water/i);
  });

  test("nudges once per latest user entry, declines legally, and suppresses suspended asks", () => {
    const initial = createInitialSweepState();
    const pending = decideSettlementTrigger({
      entries,
      state: initial,
      pendingAffordance: true,
    });
    expect(pending).toEqual({ action: "skip", reason: "pending-affordance" });

    const first = decideSettlementTrigger({
      entries,
      state: initial,
      pendingAffordance: false,
    });
    expect(first).toMatchObject({
      action: "nudge",
      throughUserEntryId: "user-reply",
      nextState: { lastCheckedUserEntryId: "user-reply" },
    });
    if (first.action !== "nudge")
      throw new Error("expected a settlement nudge");
    expect(parseSweepState(first.nextState)).toEqual(first.nextState);

    // Declining is represented by doing nothing. A later would-stop over the
    // same latest user entry must therefore settle without another nudge.
    expect(
      decideSettlementTrigger({
        entries: [
          ...entries,
          { id: "agent-declines", kind: "assistant", text: "Not yet." },
        ],
        state: first.nextState,
        pendingAffordance: false,
      }),
    ).toEqual({ action: "skip", reason: "already-checked" });

    const withNewUser: readonly SweepSessionEntry[] = [
      ...entries,
      { id: "user-2", kind: "user", text: "The receipt is emailed." },
    ];
    expect(
      decideSettlementTrigger({
        entries: withNewUser,
        state: first.nextState,
        pendingAffordance: false,
      }),
    ).toMatchObject({ action: "nudge", throughUserEntryId: "user-2" });
  });

  test("renders computed tail facts without exposing harness entry identities", () => {
    const signal = buildSettlementCheckSignal(entries.slice(0, 2));
    expect(signal).toMatchObject({
      type: "settlement-check",
      tagName: "settlement-check",
    });
    expect(signal.body).toContain("What outcome matters?");
    expect(signal.body).toContain("A shopper completes checkout.");
    expect(signal.body).toContain("Declining is legal");
    expect(signal.body).not.toContain("assistant-ask");
    expect(signal.body).not.toContain("user-reply");
  });

  test("keeps extraction quote-only and delegates the interior contract to the plugin", () => {
    const prompt = buildSweepExtractionPrompt(
      {
        targetDomain: "gherkin",
        proposalNames: ["statement-noted"],
      },
      entries.slice(0, 2),
    );
    expect(prompt).toContain("verbatim quote");
    expect(prompt).toContain("statement-noted");
    expect(prompt).toContain("declared proposal schema");
    expect(prompt).toContain("A shopper completes checkout.");
    expect(prompt).not.toContain("user-reply");
  });

  test("reports asks without an affordance-bound capture as advisory-only facts", () => {
    const unanswered: readonly SweepSessionEntry[] = [
      entries[0]!,
      { id: "redirect", kind: "user", text: "Let us discuss payment instead." },
    ];
    expect(computeUnaccountedAskAdvisories(unanswered, new Set())).toEqual([
      {
        type: "unaccounted-ask",
        affordanceId: "affordance-1",
        question: "What outcome matters?",
        message:
          "The swept range contains an ask with no affordance-bound capture.",
      },
    ]);
    expect(
      computeUnaccountedAskAdvisories(entries.slice(0, 2), new Set()),
    ).toHaveLength(1);
    expect(
      computeUnaccountedAskAdvisories(
        entries.slice(0, 2),
        new Set(["user-reply"]),
      ),
    ).toEqual([]);
  });

  test("gives a refused settled range one same-response repair continuation", () => {
    const refusal = {
      code: "evidence-quote-not-found",
      message: "Use an exact quote.",
    };
    expect(buildSweepRepairSignal(refusal)).toEqual({
      type: "sweep-repair",
      tagName: "sweep-repair",
      body: "The sweep was refused: Use an exact quote. Repair the proposal and call brunch_sweep again. Declining is legal.",
    });
    const refused: readonly SweepSessionEntry[] = [
      ...entries,
      {
        id: "refusal",
        kind: "assistant",
        text: "",
        sweepResult: { status: "refused", refusal },
      },
    ];
    expect(pendingSweepRepair(refused)).toEqual(refusal);
    expect(
      pendingSweepRepair([
        ...refused,
        { id: "repair", kind: "non-user", text: "", sweepRepairSignal: true },
      ]),
    ).toBeNull();
  });

  test("reopens settlement judgment when application refuses", () => {
    const checked = {
      sweptThroughUserEntryId: "user-reply",
      lastCheckedUserEntryId: "user-2",
    };
    expect(reopenSweepAfterRefusal(checked)).toEqual({
      sweptThroughUserEntryId: "user-reply",
      lastCheckedUserEntryId: "user-reply",
    });
    expect(
      reopenSweepAfterRefusal({
        sweptThroughUserEntryId: null,
        lastCheckedUserEntryId: "user-reply",
      }),
    ).toEqual({ sweptThroughUserEntryId: null, lastCheckedUserEntryId: null });
  });

  test("adds settlement judgment and sweep cadence without domain payload guidance", () => {
    expect(settlementProtocolInstructionFragments()).toEqual([
      "When the harness reports an unswept tail, judge whether that range has settled. Declining is legal.",
      "When it has settled, call brunch_sweep. The harness privately extracts quote-anchored proposals, refreshes durable history, applies them atomically, and advances the swept high-water mark only on success.",
      "Projection and validation are read-time operations; do not treat sweep completion as a stored derived result.",
    ]);
  });
});
