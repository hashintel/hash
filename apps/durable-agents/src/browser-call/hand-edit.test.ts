import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  handEditEntryKind,
  netEventOf,
  renderHandEditNote,
} from "../net-state/visible-net-view";
import {
  handEditReportId,
  handEditWrite,
  vHandEditReportBody,
} from "./hand-edit";

const report = {
  binding: "binding-1",
  episode: "episode-1",
  seq: 2,
  revision: "revision-2",
};

describe("hand-edit report", () => {
  test("a report's identity is its episode and seq, never its revision", () => {
    expect(handEditReportId(report)).toBe("episode-1:2");
    expect(handEditReportId({ ...report, seq: 3 })).not.toBe(
      handEditReportId(report),
    );
    expect(handEditReportId({ ...report, episode: "episode-2" })).not.toBe(
      handEditReportId(report),
    );
  });

  test("the write is a `brunch.hand-edit` note keyed by report, which the derivation reads as a note", () => {
    const write = handEditWrite(report, 7);
    expect(write).toEqual({
      type: "write",
      requestId: "brunch.hand-edit:episode-1:2",
      entry: {
        kind: handEditEntryKind,
        data: {
          episode: "episode-1",
          reportId: "episode-1:2",
          revision: "revision-2",
        },
        model: [
          {
            role: "user",
            content: renderHandEditNote("revision-2"),
            timestamp: 7,
          },
        ],
      },
    });
    if (write.type !== "write") throw new Error("Not a write.");
    const [message] = write.entry.model ?? [];
    expect(message && netEventOf(message, write.entry.kind)).toEqual({
      type: "note",
      revision: "revision-2",
    });
  });

  test("the body needs a binding, a non-empty episode and revision, and a non-negative integer seq", () => {
    expect(v.safeParse(vHandEditReportBody, report).success).toBe(true);
    for (const body of [
      { ...report, binding: undefined },
      { ...report, episode: "" },
      { ...report, seq: -1 },
      { ...report, seq: 0.5 },
      { ...report, revision: "" },
    ])
      expect(v.safeParse(vHandEditReportBody, body).success).toBe(false);
  });
});
