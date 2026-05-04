import { describe, expect, it } from "vitest";

import { createPlayback, getPlayModeBackpressure } from "./playback";

describe("getPlayModeBackpressure", () => {
  it("returns zeros for viewOnly", () => {
    expect(getPlayModeBackpressure("viewOnly")).toEqual({
      maxFramesAhead: 0,
      batchSize: 0,
    });
  });

  it("returns a small buffer for computeBuffer", () => {
    const cfg = getPlayModeBackpressure("computeBuffer");
    expect(cfg.maxFramesAhead).toBeGreaterThan(0);
    expect(cfg.batchSize).toBeGreaterThan(0);
  });

  it("returns a large buffer for computeMax", () => {
    const cfg = getPlayModeBackpressure("computeMax");
    expect(cfg.maxFramesAhead).toBeGreaterThanOrEqual(1000);
  });
});

describe("createPlayback", () => {
  it("starts Stopped at frame 0 with default mode/speed", () => {
    const pb = createPlayback();
    const s = pb.state.get();
    expect(s.playState).toBe("Stopped");
    expect(s.frameIndex).toBe(0);
    expect(s.speed).toBe(1);
    expect(s.mode).toBe("computeMax");
  });

  it("play() / pause() / stop() update playState and frameIndex", () => {
    const pb = createPlayback();
    pb.play();
    expect(pb.state.get().playState).toBe("Playing");
    pb.pause();
    expect(pb.state.get().playState).toBe("Paused");

    // Move forward then stop — frameIndex resets to 0.
    pb.setFrameIndex(5, 10);
    expect(pb.state.get().frameIndex).toBe(5);
    pb.stop();
    expect(pb.state.get().playState).toBe("Stopped");
    expect(pb.state.get().frameIndex).toBe(0);
  });

  it("setFrameIndex clamps to [0, totalFrames - 1]", () => {
    const pb = createPlayback();
    pb.setFrameIndex(-5, 10);
    expect(pb.state.get().frameIndex).toBe(0);
    pb.setFrameIndex(20, 10);
    expect(pb.state.get().frameIndex).toBe(9);
    pb.setFrameIndex(7, 10);
    expect(pb.state.get().frameIndex).toBe(7);
  });

  it("setFrameIndex is a no-op when totalFrames === 0", () => {
    const pb = createPlayback();
    pb.setFrameIndex(3, 0);
    expect(pb.state.get().frameIndex).toBe(0);
  });

  it("notifies subscribers on state change", () => {
    const pb = createPlayback();
    const seen: string[] = [];
    pb.state.subscribe((s) => seen.push(s.playState));
    pb.play();
    pb.pause();
    pb.stop();
    expect(seen).toEqual(["Playing", "Paused", "Stopped"]);
  });

  it("tick advances frameIndex based on elapsed time × speed", () => {
    const pb = createPlayback();
    pb.play();
    // dt = 0.01s = 10ms per frame.
    // First tick establishes baseline; nothing advances.
    let r = pb.tick({
      currentTime: 1000,
      dt: 0.01,
      totalFrames: 100,
      simulationDone: false,
    });
    expect(r.advanced).toBe(false);

    // After 100ms at 1x speed: 10 frames advance.
    r = pb.tick({
      currentTime: 1100,
      dt: 0.01,
      totalFrames: 100,
      simulationDone: false,
    });
    expect(r.advanced).toBe(true);
    expect(r.frameIndex).toBe(10);
    expect(pb.state.get().frameIndex).toBe(10);
  });

  it("tick honors speed multiplier", () => {
    const pb = createPlayback();
    pb.play();
    pb.setSpeed(5);
    pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 1000,
      simulationDone: false,
    });
    // 100ms wall × 5x speed = 500ms simulated → 50 frames at 10ms/frame.
    pb.tick({
      currentTime: 100,
      dt: 0.01,
      totalFrames: 1000,
      simulationDone: false,
    });
    expect(pb.state.get().frameIndex).toBe(50);
  });

  it("tick at Infinity speed jumps to the latest frame", () => {
    const pb = createPlayback();
    pb.play();
    pb.setSpeed(Number.POSITIVE_INFINITY);
    const r = pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 250,
      simulationDone: false,
    });
    expect(r.frameIndex).toBe(249);
    expect(r.advanced).toBe(true);
    expect(pb.state.get().frameIndex).toBe(249);
  });

  it("tick auto-pauses on reaching end when simulationDone", () => {
    const pb = createPlayback();
    pb.play();
    pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 5,
      simulationDone: false,
    });
    pb.tick({
      currentTime: 1000,
      dt: 0.01,
      totalFrames: 5,
      simulationDone: true,
    });
    expect(pb.state.get().frameIndex).toBe(4);
    expect(pb.state.get().playState).toBe("Paused");
  });

  it("tick auto-pauses on reaching end in viewOnly mode", () => {
    const pb = createPlayback();
    pb.play();
    pb.setMode("viewOnly");
    pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 5,
      simulationDone: false,
    });
    pb.tick({
      currentTime: 1000,
      dt: 0.01,
      totalFrames: 5,
      simulationDone: false,
    });
    expect(pb.state.get().playState).toBe("Paused");
  });

  it("tick stays Playing on reaching end when sim is still computing in compute modes", () => {
    const pb = createPlayback();
    pb.play();
    pb.setMode("computeMax");
    pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 5,
      simulationDone: false,
    });
    pb.tick({
      currentTime: 1000,
      dt: 0.01,
      totalFrames: 5,
      simulationDone: false,
    });
    expect(pb.state.get().frameIndex).toBe(4);
    expect(pb.state.get().playState).toBe("Playing");
  });

  it("tick is a no-op when not Playing", () => {
    const pb = createPlayback();
    // Default state is Stopped.
    pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 100,
      simulationDone: false,
    });
    pb.tick({
      currentTime: 1000,
      dt: 0.01,
      totalFrames: 100,
      simulationDone: false,
    });
    expect(pb.state.get().frameIndex).toBe(0);
  });

  it("dispose() makes subsequent calls no-ops", () => {
    const pb = createPlayback();
    pb.dispose();
    pb.play();
    expect(pb.state.get().playState).toBe("Stopped");
    pb.setSpeed(10);
    expect(pb.state.get().speed).toBe(1);
  });

  it("dispose() is idempotent", () => {
    const pb = createPlayback();
    pb.dispose();
    expect(() => pb.dispose()).not.toThrow();
  });

  it("resetTiming() clears the accumulated tick state", () => {
    const pb = createPlayback();
    pb.play();
    pb.tick({
      currentTime: 0,
      dt: 0.01,
      totalFrames: 100,
      simulationDone: false,
    });
    pb.resetTiming();
    // After reset, the next tick should establish a new baseline (no advance).
    const r = pb.tick({
      currentTime: 5000, // huge gap, would have advanced many frames if not reset
      dt: 0.01,
      totalFrames: 100,
      simulationDone: false,
    });
    expect(r.advanced).toBe(false);
  });
});
