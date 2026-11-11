import { describe, expect, it } from "vitest";

import {
  createViewportAnimator,
  stepCriticalSpring,
} from "./viewport-animator";

import type { CanvasViewport } from "./canvas-renderer";

/** A frame clock the test advances by hand. */
const manualFrames = () => {
  let queued: ((time: number) => void) | null = null;
  let time = 0;
  return {
    requestFrame: (callback: (time: number) => void) => {
      queued = callback;
      return 1;
    },
    cancelFrame: () => {
      queued = null;
    },
    /** Runs frames 16 ms apart until none is queued, or the limit. */
    run: (limit = 200) => {
      let frames = 0;
      while (queued && frames < limit) {
        const callback = queued;
        queued = null;
        time += 16;
        callback(time);
        frames += 1;
      }
      return frames;
    },
    step: () => {
      const callback = queued;
      queued = null;
      time += 16;
      callback?.(time);
    },
  };
};

describe("stepCriticalSpring", () => {
  it("approaches the target without overshooting", () => {
    let channel = { value: 0, velocity: 0 };
    const values: number[] = [];
    for (let frame = 0; frame < 40; frame++) {
      channel = stepCriticalSpring(channel, 100, 14, 1 / 60);
      values.push(channel.value);
    }
    expect(Math.max(...values)).toBeLessThanOrEqual(100);
    expect(values.at(-1)).toBeCloseTo(100, 0);
  });
});

describe("createViewportAnimator", () => {
  it("eases to the target and ends exactly on it", async () => {
    const frames = manualFrames();
    let viewport: CanvasViewport = { x: 0, y: 0, zoom: 1 };
    const animator = createViewportAnimator({
      read: () => viewport,
      write: (next) => {
        viewport = next;
      },
      ...frames,
    });

    const done = animator.animateTo({ x: 300, y: -120, zoom: 2 });
    expect(animator.isAnimating()).toBe(true);
    const frameCount = frames.run();

    await done;
    expect(viewport).toEqual({ x: 300, y: -120, zoom: 2 });
    expect(frameCount).toBeGreaterThan(5);
    expect(animator.isAnimating()).toBe(false);
  });

  it("keeps moving forward when retargeted mid-flight", () => {
    const frames = manualFrames();
    let viewport: CanvasViewport = { x: 0, y: 0, zoom: 1 };
    const animator = createViewportAnimator({
      read: () => viewport,
      write: (next) => {
        viewport = next;
      },
      ...frames,
    });

    void animator.animateTo({ x: 200, y: 0, zoom: 1 });
    frames.step();
    frames.step();
    const before = viewport.x;
    void animator.animateTo({ x: 400, y: 0, zoom: 1 });
    frames.step();

    expect(viewport.x).toBeGreaterThan(before);
    frames.run();
    expect(viewport.x).toBe(400);
  });

  it("jumps when animation is off, and stops where it is when cancelled", async () => {
    const frames = manualFrames();
    let viewport: CanvasViewport = { x: 0, y: 0, zoom: 1 };
    let animated = false;
    const animator = createViewportAnimator({
      read: () => viewport,
      write: (next) => {
        viewport = next;
      },
      animated: () => animated,
      ...frames,
    });

    await animator.animateTo({ x: 50, y: 50, zoom: 1 });
    expect(viewport).toEqual({ x: 50, y: 50, zoom: 1 });

    animated = true;
    const done = animator.animateTo({ x: 500, y: 50, zoom: 1 });
    frames.step();
    animator.cancel();
    const stopped = viewport.x;
    frames.run();

    await done;
    expect(viewport.x).toBe(stopped);
  });
});
