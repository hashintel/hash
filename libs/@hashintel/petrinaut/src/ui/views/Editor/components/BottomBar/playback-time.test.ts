import { describe, expect, it } from "vitest";

import { formatPlaybackTimes, playbackTimes } from "./playback-time";

describe("playbackTimes", () => {
  it("places the first frame at the start of the run", () => {
    expect(
      playbackTimes({ frameIndex: 0, totalFrames: 100, dt: 0.01 }),
    ).toEqual({ elapsed: 0, total: 0.99 });
  });

  it("ends the run on its last produced frame", () => {
    const { elapsed, total } = playbackTimes({
      frameIndex: 99,
      totalFrames: 100,
      dt: 0.01,
    });

    expect(elapsed).toBeCloseTo(0.99);
    expect(elapsed).toBeCloseTo(total);
  });

  it("reports no total before a frame exists", () => {
    expect(playbackTimes({ frameIndex: 0, totalFrames: 0, dt: 0.01 })).toEqual({
      elapsed: 0,
      total: 0,
    });
  });
});

describe("formatPlaybackTimes", () => {
  it.each([
    { dt: 0.5, elapsed: "1.5", total: "4.5s" },
    { dt: 0.01, elapsed: "1.50", total: "4.50s" },
    { dt: 0.001, elapsed: "1.500", total: "4.500s" },
  ])("prints a run of step $dt at its own precision", ({ dt, ...expected }) => {
    expect(formatPlaybackTimes({ elapsed: 1.5, total: 4.5 }, dt)).toEqual(
      expected,
    );
  });

  it("falls back to milliseconds for a step it cannot read", () => {
    expect(formatPlaybackTimes({ elapsed: 0, total: 0 }, 0)).toEqual({
      elapsed: "0.000",
      total: "0.000s",
    });
  });
});
