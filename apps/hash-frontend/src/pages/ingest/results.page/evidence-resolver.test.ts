import { describe, expect, it } from "vitest";

import { buildEntityAssertionMap } from "./evidence-resolver";

import type { AssertionWindow, MentionContextPlan } from "../shared/types";

const diagnostics = {
  relevantChunkCount: 1,
  mentionCount: 1,
  relevantMentionCount: 1,
  resolvedWindowCount: 1,
  mentionChunkCoverage: 1,
};

const assertionWindow = (
  blockId: string,
  participantIds: string[],
): AssertionWindow => ({
  text: `Window in ${blockId}`,
  chunkId: "chunk-1",
  blockId,
  windowStart: 0,
  windowEnd: 10,
  mentionStart: 0,
  mentionEnd: 4,
  mentionSurface: "Acme",
  discourseResolutions: [],
  evidenceRole: "attributive",
  participants: participantIds.map((rosterEntryId) => ({
    rosterEntryId,
    canonicalName: rosterEntryId,
    role: "subject",
  })),
});

describe("buildEntityAssertionMap", () => {
  it("lists each window under every participant, once, skipping fallback plans", () => {
    const shared = assertionWindow("block-1", ["acme", "bob"]);
    const mentionContexts: MentionContextPlan[] = [
      {
        localId: "context-1",
        mode: "assertion_windows",
        assertionWindows: [shared, assertionWindow("block-2", ["acme"])],
        diagnostics,
      },
      {
        localId: "context-2",
        mode: "assertion_windows",
        assertionWindows: [shared],
        diagnostics,
      },
      {
        localId: "context-3",
        mode: "mechanical_fallback",
        fallbackWindows: [assertionWindow("block-3", [])],
        fallbackReason: "no windows",
        diagnostics,
      },
    ];

    const windowsByEntity = buildEntityAssertionMap(mentionContexts);

    expect(
      windowsByEntity.get("acme")?.map((window) => window.blockId),
    ).toEqual(["block-1", "block-2"]);
    expect(windowsByEntity.get("bob")?.map((window) => window.blockId)).toEqual(
      ["block-1"],
    );
  });
});
