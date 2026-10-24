import type { ReadableStore } from "@hashintel/petrinaut-core";

export interface PluginFrameSample {
  readonly time: number;
  readonly durationMs: number;
  readonly fps: number;
  readonly longestFrameMs: number;
}

export interface PluginPerformanceEntry {
  readonly id: string;
  readonly name: string;
  /** Elapsed time from host creation to its first contribution publication. */
  readonly firstPublicationMs: number | null;
  readonly publications: number;
  readonly publicationsPerSecond: number;
  /** Distinct React commit timestamps observed across this plugin's boundaries. */
  readonly profiledCommits: number;
  /** Sum of React actualDuration across the plugin's separate boundaries. */
  readonly renderMs: number | null;
}

export interface PluginPerformanceSnapshot {
  readonly collecting: boolean;
  readonly hidden: boolean;
  readonly observedMs: number;
  readonly frames: readonly PluginFrameSample[];
  readonly plugins: readonly PluginPerformanceEntry[];
  readonly omittedPlugins: number;
  readonly reactProfiling: "waiting-for-callback" | "observed";
  /** Synchronous observer work in the preceding sample, including listener delivery. */
  readonly observerMs: number;
}

/** `access: { performance: "read" }`. Subscribing collects; the last unsubscribe stops collection. */
export interface PluginPerformance {
  readonly snapshot: ReadableStore<PluginPerformanceSnapshot>;
}

interface PerformanceEnvironment {
  now(): number;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  hidden(): boolean;
  onVisibilityChange(callback: () => void): () => void;
}

export interface PerformanceHost {
  readonly id: string;
  readonly name: string;
  readonly startedAt: number;
  firstPublicationMs: number | null;
  publications: number;
  profiledCommits: number;
  lastCommitTime: number | null;
  renderMs: number | null;
}

const browserEnvironment: PerformanceEnvironment = {
  now: () => performance.now(),
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (id) => cancelAnimationFrame(id),
  hidden: () => document.visibilityState === "hidden",
  onVisibilityChange: (callback) => {
    document.addEventListener("visibilitychange", callback);
    return () => document.removeEventListener("visibilitychange", callback);
  },
};

const emptySnapshot: PluginPerformanceSnapshot = Object.freeze({
  collecting: false,
  hidden: false,
  observedMs: 0,
  frames: Object.freeze([]),
  plugins: Object.freeze([]),
  omittedPlugins: 0,
  reactProfiling: "waiting-for-callback",
  observerMs: 0,
});

const resetHost = (host: PerformanceHost) => {
  Object.assign(host, {
    publications: 0,
    profiledCommits: 0,
    lastCommitTime: null,
    renderMs: null,
  });
};

export const createPluginPerformance = (
  environment: PerformanceEnvironment = browserEnvironment,
) => {
  const hosts = new Map<string, PerformanceHost>();
  const listeners = new Set<(value: PluginPerformanceSnapshot) => void>();
  let snapshot = emptySnapshot;
  let frameId: number | null = null;
  let removeVisibilityListener: (() => void) | undefined;
  let startedAt = 0;
  let sampleStart = 0;
  let previousFrame: number | null = null;
  let frames = 0;
  let longestFrameMs = 0;
  let observerMs = 0;
  let hidden = false;
  let observedProfiling = false;
  let connected = true;

  const collecting = () => connected && listeners.size > 0 && !hidden;

  const notify = () => {
    for (const listener of listeners) {
      listener(snapshot);
    }
  };

  const resetSample = (now: number) => {
    sampleStart = now;
    previousFrame = null;
    frames = 0;
    longestFrameMs = 0;
  };

  const cancelFrame = () => {
    if (frameId !== null) {
      environment.cancelFrame(frameId);
      frameId = null;
    }
  };

  const tick = () => {
    frameId = null;
    if (!collecting()) {
      return;
    }
    const now = environment.now();
    if (previousFrame !== null) {
      longestFrameMs = Math.max(longestFrameMs, now - previousFrame);
    }
    previousFrame = now;
    frames += 1;
    const durationMs = now - sampleStart;
    if (durationMs >= 250) {
      const observedMs = now - startedAt;
      const entries = [...hosts.values()].slice(0, 128).map((host) =>
        Object.freeze({
          id: host.id,
          name: host.name,
          firstPublicationMs: host.firstPublicationMs,
          publications: host.publications,
          publicationsPerSecond: (host.publications * 1000) / observedMs,
          profiledCommits: host.profiledCommits,
          renderMs: host.renderMs,
        }),
      );
      snapshot = Object.freeze({
        collecting: true,
        hidden: false,
        observedMs,
        frames: Object.freeze([
          ...snapshot.frames.slice(-23),
          Object.freeze({
            time: now,
            durationMs,
            fps: (frames * 1000) / durationMs,
            longestFrameMs,
          }),
        ]),
        plugins: Object.freeze(entries),
        omittedPlugins: Math.max(0, hosts.size - entries.length),
        reactProfiling: observedProfiling ? "observed" : "waiting-for-callback",
        observerMs,
      });
      observerMs = 0;
      // Keep the preceding frame timestamp so a stall across samples is counted.
      sampleStart = now;
      frames = 0;
      longestFrameMs = 0;
      notify();
    }
    observerMs += environment.now() - now;
    if (collecting()) {
      frameId = environment.requestFrame(tick);
    }
  };

  const start = () => {
    hidden = environment.hidden();
    startedAt = environment.now();
    resetSample(startedAt);
    observerMs = 0;
    observedProfiling = false;
    for (const host of hosts.values()) {
      resetHost(host);
    }
    snapshot = Object.freeze({ ...emptySnapshot, collecting: true, hidden });
    removeVisibilityListener = environment.onVisibilityChange(() => {
      hidden = environment.hidden();
      cancelFrame();
      // Resume with a fresh observation window; background throttling is excluded.
      startedAt = environment.now();
      resetSample(startedAt);
      for (const host of hosts.values()) {
        resetHost(host);
      }
      observedProfiling = false;
      observerMs = 0;
      snapshot = Object.freeze({ ...emptySnapshot, collecting: true, hidden });
      notify();
      if (collecting()) {
        frameId = environment.requestFrame(tick);
      }
    });
    if (!hidden) {
      frameId = environment.requestFrame(tick);
    }
  };

  const stop = () => {
    cancelFrame();
    removeVisibilityListener?.();
    removeVisibilityListener = undefined;
    snapshot = Object.freeze({ ...snapshot, collecting: false });
  };

  const api: PluginPerformance = Object.freeze({
    snapshot: Object.freeze({
      get: () => snapshot,
      subscribe: (listener: (value: PluginPerformanceSnapshot) => void) => {
        // Each subscription owns its removal, even when a caller reuses a callback.
        const subscription = (value: PluginPerformanceSnapshot) =>
          listener(value);
        listeners.add(subscription);
        if (connected && listeners.size === 1) {
          start();
        }
        return () => {
          listeners.delete(subscription);
          if (listeners.size === 0) {
            stop();
          }
        };
      },
    }),
  });

  return {
    api,
    createHost: (id: string, name: string): PerformanceHost => ({
      id,
      name,
      startedAt: environment.now(),
      firstPublicationMs: null,
      publications: 0,
      profiledCommits: 0,
      lastCommitTime: null,
      renderMs: null,
    }),
    mount: (host: PerformanceHost) => {
      hosts.set(host.id, host);
      return () => {
        if (hosts.get(host.id) === host) {
          hosts.delete(host.id);
        }
      };
    },
    published: (host: PerformanceHost) => {
      hosts.set(host.id, host);
      if (host.firstPublicationMs === null) {
        Object.assign(host, {
          firstPublicationMs: environment.now() - host.startedAt,
        });
      }
      if (collecting()) {
        Object.assign(host, { publications: host.publications + 1 });
      }
    },
    rendered: (id: string, actualDuration: number, commitTime: number) => {
      if (!collecting()) {
        return;
      }
      const started = environment.now();
      observedProfiling = true;
      const host = hosts.get(id);
      if (host !== undefined) {
        if (host.lastCommitTime !== commitTime) {
          host.profiledCommits += 1;
          host.lastCommitTime = commitTime;
        }
        host.renderMs = (host.renderMs ?? 0) + actualDuration;
      }
      observerMs += environment.now() - started;
    },
    connect: () => {
      connected = true;
      if (listeners.size > 0 && removeVisibilityListener === undefined) {
        start();
      }
      return () => {
        connected = false;
        stop();
      };
    },
  };
};

export type PluginPerformanceRuntime = ReturnType<
  typeof createPluginPerformance
>;
