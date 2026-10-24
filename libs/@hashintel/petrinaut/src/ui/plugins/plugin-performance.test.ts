import { describe, expect, it, vi } from "vitest";

import { createPluginPerformance } from "./plugin-performance";

const setup = () => {
  let now = 0;
  let hidden = false;
  let serial = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const visibilityListeners = new Set<() => void>();
  const clock = vi.fn(() => now);
  const runtime = createPluginPerformance({
    now: clock,
    hidden: () => hidden,
    requestFrame: (callback) => {
      callbacks.set(++serial, callback);
      return serial;
    },
    cancelFrame: (id) => {
      callbacks.delete(id);
    },
    onVisibilityChange: (callback) => {
      visibilityListeners.add(callback);
      return () => {
        visibilityListeners.delete(callback);
      };
    },
  });
  return {
    runtime,
    callbacks,
    visibilityListeners,
    clock,
    advance: (duration: number) => {
      now += duration;
    },
    frame: (duration = 16) => {
      now += duration;
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) {
        callback(now);
      }
    },
    visibility: (nextHidden: boolean) => {
      hidden = nextHidden;
      for (const callback of visibilityListeners) {
        callback();
      }
    },
  };
};

describe("plugin performance collection", () => {
  it("shares one frame loop and removes it with the last subscriber", () => {
    const { runtime, callbacks, visibilityListeners, clock } = setup();
    const listener = vi.fn();
    expect(callbacks.size).toBe(0);
    expect(clock).not.toHaveBeenCalled();
    const first = runtime.api.snapshot.subscribe(listener);
    const second = runtime.api.snapshot.subscribe(listener);
    expect(callbacks.size).toBe(1);
    expect(visibilityListeners.size).toBe(1);
    first();
    first();
    expect(callbacks.size).toBe(1);
    second();
    expect(callbacks.size).toBe(0);
    expect(visibilityListeners.size).toBe(0);
    expect(runtime.api.snapshot.get().collecting).toBe(false);
  });

  it("batches samples, retains 24 columns, and includes stalls in elapsed time", () => {
    const { runtime, frame } = setup();
    const listener = vi.fn();
    runtime.api.snapshot.subscribe(listener);
    for (let index = 0; index < 14; index++) {
      frame();
    }
    expect(listener).not.toHaveBeenCalled();
    frame(300);
    const stalled = runtime.api.snapshot.get().frames.at(-1);
    expect(stalled?.fps).toBeLessThan(30);
    expect(stalled?.longestFrameMs).toBe(300);
    for (let index = 0; index < 30; index++) {
      frame(250);
    }
    expect(runtime.api.snapshot.get().frames).toHaveLength(24);
    expect(listener).toHaveBeenCalledTimes(31);
  });

  it("starts a fresh window after visibility changes and a new subscription", () => {
    const { runtime, frame, advance, visibility, callbacks } = setup();
    const stop = runtime.api.snapshot.subscribe(() => {});
    frame(250);
    visibility(true);
    advance(60_000);
    expect(callbacks.size).toBe(0);
    expect(runtime.api.snapshot.get().hidden).toBe(true);
    visibility(false);
    frame(250);
    expect(runtime.api.snapshot.get().observedMs).toBe(250);
    expect(runtime.api.snapshot.get().frames).toHaveLength(1);
    stop();
    runtime.api.snapshot.subscribe(() => {});
    expect(runtime.api.snapshot.get().frames).toHaveLength(0);
  });

  it("keeps lifecycle latency and counts publications only during observation", () => {
    const { runtime, advance, frame, clock } = setup();
    const host = runtime.createHost("test", "Test");
    const unmount = runtime.mount(host);
    advance(12);
    runtime.published(host);
    clock.mockClear();
    runtime.published(host);
    runtime.rendered("test", 100, 1);
    expect(clock).not.toHaveBeenCalled();
    runtime.api.snapshot.subscribe(() => {});
    runtime.published(host);
    runtime.published(host);
    frame(250);
    expect(runtime.api.snapshot.get().plugins).toEqual([
      {
        id: "test",
        name: "Test",
        firstPublicationMs: 12,
        publications: 2,
        publicationsPerSecond: 8,
        profiledCommits: 0,
        renderMs: null,
      },
    ]);
    expect(runtime.api.snapshot.get().reactProfiling).toBe(
      "waiting-for-callback",
    );
    unmount();
    frame(250);
    expect(runtime.api.snapshot.get().plugins).toHaveLength(0);
  });

  it("groups separate plugin boundaries by commit time and freezes public values", () => {
    const { runtime, frame } = setup();
    runtime.mount(runtime.createHost("test", "Test"));
    runtime.api.snapshot.subscribe(() => {});
    runtime.rendered("test", 2, 1);
    runtime.rendered("test", 3, 1);
    runtime.rendered("test", 4, 2);
    frame(250);
    const snapshot = runtime.api.snapshot.get();
    expect(snapshot.plugins[0]).toMatchObject({
      profiledCommits: 2,
      renderMs: 9,
    });
    expect(snapshot.reactProfiling).toBe("observed");
    expect(Object.isFrozen(runtime.api)).toBe(true);
    expect(Object.isFrozen(runtime.api.snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.frames[0])).toBe(true);
    expect(Object.isFrozen(snapshot.plugins[0])).toBe(true);
    expect(runtime.api.snapshot).not.toHaveProperty("set");
  });

  it("stops on editor disposal, including disposal during publication, and can reconnect", () => {
    const { runtime, callbacks, frame, visibilityListeners } = setup();
    const disconnect = runtime.connect();
    const stop = runtime.api.snapshot.subscribe(() => disconnect());
    frame(250);
    expect(callbacks.size).toBe(0);
    expect(visibilityListeners.size).toBe(0);
    stop();
    const unsubscribe = runtime.api.snapshot.subscribe(() => {});
    expect(callbacks.size).toBe(0);
    runtime.connect();
    expect(callbacks.size).toBe(1);
    unsubscribe();
    expect(callbacks.size).toBe(0);
  });
});
