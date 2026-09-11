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
    {
      dt: 1,
      times: { elapsed: 2, total: 5 },
      printed: { elapsed: "2", total: "5s" },
    },
    {
      dt: 0.5,
      times: { elapsed: 1.5, total: 4.5 },
      printed: { elapsed: "1.5", total: "4.5s" },
    },
    // Not a power of ten: bucketing by magnitude printed "1.8" for 1.75.
    {
      dt: 0.25,
      times: { elapsed: 1.75, total: 4.75 },
      printed: { elapsed: "1.75", total: "4.75s" },
    },
    {
      dt: 0.01,
      times: { elapsed: 1.75, total: 4.75 },
      printed: { elapsed: "1.75", total: "4.75s" },
    },
    {
      dt: 0.025,
      times: { elapsed: 1.75, total: 4.75 },
      printed: { elapsed: "1.750", total: "4.750s" },
    },
    {
      dt: 0.001,
      times: { elapsed: 1.75, total: 4.75 },
      printed: { elapsed: "1.750", total: "4.750s" },
    },
  ])(
    "prints a run of step $dt at its own precision",
    ({ dt, times, printed }) => {
      expect(formatPlaybackTimes(times, dt)).toEqual(printed);
    },
  );

  it("never prints more than milliseconds, however fine the step", () => {
    // A step of 0.0025 carries four decimals; the readout stops at three.
    expect(
      formatPlaybackTimes({ elapsed: 0.005, total: 0.01 }, 0.0025),
    ).toEqual({ elapsed: "0.005", total: "0.010s" });
  });

  it("falls back to milliseconds for a step it cannot read", () => {
    expect(formatPlaybackTimes({ elapsed: 0, total: 0 }, 0)).toEqual({
      elapsed: "0.000",
      total: "0.000s",
    });
  });
});
