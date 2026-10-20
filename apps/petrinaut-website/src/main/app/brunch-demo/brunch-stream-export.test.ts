import { describe, expect, it } from "vitest";

import { createBrunchStreamRecording } from "./brunch-stream-export";

describe("createBrunchStreamRecording", () => {
  it("keeps the frames as received, in the version 1 stream format", () => {
    const rawDefinition = {
      title: "Raw Brunch run",
      places: [{ id: "queued", name: "Queued" }],
      transitions: [],
    };

    expect(
      createBrunchStreamRecording(
        {
          endpoint: "http://127.0.0.1:5184/stream",
          runId: "run-1",
          title: "Replay",
          receivedEvents: [{ event: "definition", data: rawDefinition }],
        },
        "2026-06-05T10:01:00.000Z",
      ),
    ).toEqual({
      version: 1,
      exportedAt: "2026-06-05T10:01:00.000Z",
      title: "Replay",
      source: {
        kind: "brunch",
        endpoint: "http://127.0.0.1:5184/stream",
        runId: "run-1",
      },
      events: [{ event: "definition", data: rawDefinition }],
    });
  });
});
