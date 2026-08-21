import { describe, expect, test } from "bun:test";

import { capturedUserEntryIdsForSession } from "../src/capture-accounting.ts";

import type { CaptureStoreSnapshot, EvidenceSpan } from "@brunch/core";

const evidence = (sessionId: string): EvidenceSpan => ({
  excerpt: "A colliding quote.",
  pointer: { sessionId, entryStart: 1, entryEnd: 1 },
  source: "user-affordance-payload",
});

describe("capture accounting", () => {
  test("uses the current archived kind when persisted capture provenance is stale", async () => {
    const snapshot = {
      captures: [
        {
          id: "capture-reclassified-affordance-reply",
          dedupKey: "reclassified",
          evidence: [
            {
              excerpt: "An answer later recognized as an affordance reply.",
              pointer: {
                sessionId: "session-active",
                entryStart: 1,
                entryEnd: 1,
              },
              source: "user",
            },
          ],
          epistemicStatus: "explicit",
          confidence: "firm",
          content: { value: "reclassified" },
        },
        {
          id: "capture-ordinary-user-entry",
          dedupKey: "ordinary",
          evidence: [
            {
              excerpt: "An ordinary user answer.",
              pointer: {
                sessionId: "session-active",
                entryStart: 2,
                entryEnd: 2,
              },
              source: "user-affordance-payload",
            },
          ],
          epistemicStatus: "explicit",
          confidence: "firm",
          content: { value: "ordinary" },
        },
      ],
      issues: [],
      events: [],
    } satisfies CaptureStoreSnapshot;

    const entryIds = await capturedUserEntryIdsForSession(
      {
        async readArchivedEntries(pointer) {
          const kind =
            pointer.entryStart === 1
              ? "user-affordance-payload"
              : ("user" as const);
          return [
            {
              ordinal: pointer.entryStart,
              substrateEntryId:
                pointer.entryStart === 1
                  ? "reclassified-affordance-reply"
                  : "ordinary-user-entry",
              versions: [
                {
                  version: 1,
                  observedAtOffset: "offset-current",
                  kind,
                  text: "answer",
                  materialized: { role: "user" },
                },
              ],
            },
          ];
        },
      },
      snapshot,
      "session-active",
    );

    expect(entryIds).toEqual(new Set(["reclassified-affordance-reply"]));
  });

  test("keeps host-session identity when Flue entry ids collide", async () => {
    const pointersRead: string[] = [];
    const snapshot = {
      captures: [
        {
          id: "capture-other-session",
          dedupKey: "other",
          evidence: [evidence("session-other")],
          epistemicStatus: "explicit",
          confidence: "firm",
          content: { value: "other" },
        },
        {
          id: "capture-active-session",
          dedupKey: "active",
          evidence: [evidence("session-active")],
          epistemicStatus: "explicit",
          confidence: "firm",
          content: { value: "active" },
        },
      ],
      issues: [],
      events: [],
    } satisfies CaptureStoreSnapshot;

    const entryIds = await capturedUserEntryIdsForSession(
      {
        async readArchivedEntries(pointer) {
          pointersRead.push(pointer.sessionId);
          return [
            {
              ordinal: 1,
              substrateEntryId: "colliding-flue-entry-id",
              versions: [
                {
                  version: 1,
                  observedAtOffset: "offset-current",
                  kind: "user-affordance-payload",
                  text: "A colliding quote.",
                  materialized: { role: "user" },
                },
              ],
            },
          ];
        },
      },
      snapshot,
      "session-active",
    );

    expect(entryIds).toEqual(new Set(["colliding-flue-entry-id"]));
    expect(pointersRead).toEqual(["session-active"]);
  });
});
