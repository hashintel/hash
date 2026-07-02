import { describe, expect, it } from "vitest";

import { RenderMetricsProbe } from "./render-metrics";

import type { DeckMetrics, FrameLoop, LongTaskSource } from "./render-metrics";

/** Manual frame loop: the test fires rAF callbacks with explicit timestamps. */
function manualFrameLoop(): FrameLoop & {
  fire: (timestampMs: number) => void;
  cancelled: number[];
} {
  let nextHandle = 1;
  let pending: {
    handle: number;
    callback: (timestampMs: number) => void;
  } | null = null;
  const cancelled: number[] = [];
  return {
    schedule: (callback) => {
      const handle = nextHandle;
      nextHandle += 1;
      pending = { handle, callback };
      return handle;
    },
    cancel: (handle) => {
      cancelled.push(handle);
      if (pending?.handle === handle) {
        pending = null;
      }
    },
    fire: (timestampMs) => {
      const current = pending;
      pending = null;
      current?.callback(timestampMs);
    },
    cancelled,
  };
}

const deckSample = (overrides: Partial<DeckMetrics>): DeckMetrics => ({
  fps: 60,
  setPropsTime: 0,
  layersCount: 0,
  drawLayersCount: 0,
  updateLayersCount: 0,
  updateAttributesTime: 0,
  updateAttributesCount: 0,
  framesRedrawn: 0,
  pickTime: 0,
  pickCount: 0,
  pickLayersCount: 0,
  gpuTime: 0,
  gpuTimePerFrame: 0,
  cpuTime: 0,
  cpuTimePerFrame: 0,
  bufferMemory: 0,
  textureMemory: 0,
  renderbufferMemory: 0,
  gpuMemory: 0,
  ...overrides,
});

function probeAt(times: number[]): RenderMetricsProbe {
  return new RenderMetricsProbe({ clock: () => times.shift() ?? 0 });
}

/** Manual long-task source: the test emits entries directly. */
function manualLongTaskSource(): LongTaskSource & {
  emit: (startTimeMs: number, durationMs: number) => void;
  disconnected: () => boolean;
} {
  let deliver: ((startTimeMs: number, durationMs: number) => void) | null =
    null;
  return {
    observe: (onEntry) => {
      deliver = onEntry;
      return () => {
        deliver = null;
      };
    },
    emit: (startTimeMs, durationMs) => {
      deliver?.(startTimeMs, durationMs);
    },
    disconnected: () => deliver === null,
  };
}

describe("RenderMetricsProbe", () => {
  it("summarises rebuild spans with mean, p95 and max", () => {
    const probe = probeAt([0, 10_000]);
    probe.start(0);
    // 1..20ms: p95 (nearest rank of 20 values) = 19, max = 20, mean = 10.5.
    for (let elapsed = 1; elapsed <= 20; elapsed++) {
      probe.recordRebuild(elapsed);
    }

    const report = probe.stop(0);

    expect(report.durationMs).toBe(10_000);
    expect(report.rebuild).toEqual({
      count: 20,
      meanMs: 10.5,
      p95Ms: 19,
      maxMs: 20,
    });
  });

  it("averages deck samples and totals redrawn frames", () => {
    const probe = probeAt([0, 2000]);
    probe.start(0);
    probe.sampleDeckMetrics(
      deckSample({ fps: 60, cpuTimePerFrame: 4, framesRedrawn: 60 }),
    );
    probe.sampleDeckMetrics(
      deckSample({ fps: 30, cpuTimePerFrame: 8, framesRedrawn: 30 }),
    );

    const report = probe.stop(0);

    expect(report.deck.samples).toBe(2);
    expect(report.deck.fps).toBe(45);
    expect(report.deck.cpuTimePerFrame).toBe(6);
    expect(report.deck.framesRedrawn).toBe(90);
  });

  it("snapshots deck metrics objects (deck mutates one instance in place)", () => {
    const probe = probeAt([0, 1000]);
    probe.start(0);
    const reused = deckSample({ fps: 60 });
    probe.sampleDeckMetrics(reused);
    // Deck updates the same object for the next second.
    reused.fps = 1;
    probe.sampleDeckMetrics(reused);

    const report = probe.stop(0);

    expect(report.deck.fps).toBe((60 + 1) / 2);
  });

  it("ignores records outside a capture window", () => {
    const probe = probeAt([0, 1000]);
    probe.recordRebuild(50);
    probe.sampleDeckMetrics(deckSample({ fps: 10 }));

    probe.start(0);
    const report = probe.stop(0);

    expect(report.rebuild.count).toBe(0);
    expect(report.deck.samples).toBe(0);
    expect(report.rebuild.meanMs).toBe(0);
  });

  it("resets accumulated data on restart", () => {
    const probe = probeAt([0, 1000, 2000, 3000]);
    probe.start(0);
    probe.recordRebuild(5);
    probe.stop(0);

    probe.start(0);
    const report = probe.stop(0);

    expect(report.rebuild.count).toBe(0);
  });

  it("tracks the zoom envelope from start through stop", () => {
    const probe = probeAt([0, 1000]);
    probe.start(2);
    probe.recordZoom(1.5);
    probe.recordZoom(3);

    const report = probe.stop(2.5);

    expect(report.camera).toEqual({
      initialZoom: 2,
      finalZoom: 2.5,
      minZoom: 1.5,
      maxZoom: 3,
    });
  });

  it("resets the zoom envelope on restart", () => {
    const probe = probeAt([0, 1000, 2000, 3000]);
    probe.start(0);
    probe.recordZoom(-4);
    probe.stop(0);

    probe.start(1);
    const report = probe.stop(1);

    expect(report.camera).toEqual({
      initialZoom: 1,
      finalZoom: 1,
      minZoom: 1,
      maxZoom: 1,
    });
  });

  it("summarises rAF frame intervals and counts hitches", () => {
    const loop = manualFrameLoop();
    const probe = new RenderMetricsProbe({ clock: () => 0, frameLoop: loop });
    probe.start(0);

    // Timestamps: steady 16.7ms cadence with one 100ms stall in the middle.
    // Intervals: [16.7, 16.7, 100, 16.7] -> one hitch, max 100.
    for (const timestamp of [0, 16.7, 33.4, 133.4, 150.1]) {
      loop.fire(timestamp);
    }

    const report = probe.stop(0);

    expect(report.frames.count).toBe(4);
    expect(report.frames.hitchCount).toBe(1);
    expect(report.frames.maxMs).toBeCloseTo(100, 5);
    expect(report.frames.p50Ms).toBeCloseTo(16.7, 5);
    expect(report.frames.p99Ms).toBeCloseTo(100, 5);
    expect(report.frames.meanMs).toBeCloseTo((16.7 * 3 + 100) / 4, 5);
  });

  it("lists the worst hitches with capture-relative end timestamps", () => {
    const loop = manualFrameLoop();
    // Capture starts at clock 1000; rAF timestamps share that timeline.
    const probe = new RenderMetricsProbe({
      clock: () => 1000,
      frameLoop: loop,
    });
    probe.start(0);

    // Intervals: [50, 16, 80, 16] ending at 1050, 1066, 1146, 1162.
    for (const timestamp of [1000, 1050, 1066, 1146, 1162]) {
      loop.fire(timestamp);
    }

    const report = probe.stop(0);

    expect(report.frames.hitchCount).toBe(2);
    expect(report.frames.worst).toEqual([
      { atMs: 146, durationMs: 80 },
      { atMs: 50, durationMs: 50 },
    ]);
  });

  it("stops the frame loop on stop and resets intervals on restart", () => {
    const loop = manualFrameLoop();
    const probe = new RenderMetricsProbe({ clock: () => 0, frameLoop: loop });
    probe.start(0);
    loop.fire(0);
    loop.fire(20);
    probe.stop(0);

    // The pending callback was cancelled; a late fire records nothing.
    expect(loop.cancelled.length).toBe(1);
    loop.fire(1000);

    probe.start(0);
    const report = probe.stop(0);
    expect(report.frames.count).toBe(0);
  });

  it("reports zero frame stats without a frame loop (non-browser)", () => {
    const probe = new RenderMetricsProbe({ clock: () => 0, frameLoop: null });
    probe.start(0);

    const report = probe.stop(0);

    expect(report.frames).toEqual({
      count: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      hitchCount: 0,
      worst: [],
    });
    expect(report.longTasks).toEqual({
      available: false,
      count: 0,
      totalMs: 0,
      maxMs: 0,
      worst: [],
    });
    expect(report.gpu).toEqual({
      available: false,
      samples: 0,
      disjointCount: 0,
      meanMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      maxMs: 0,
      worst: [],
    });
  });

  it("summarises GPU frame samples capture-relative with disjoints", () => {
    const probe = new RenderMetricsProbe({ clock: () => 3000 });
    probe.start(0);
    probe.noteGpuAvailability(true);

    // Submit times on the shared timeline (capture start = 3000).
    probe.recordGpuFrame(3100, 4);
    probe.recordGpuFrame(3200, 80);
    probe.recordGpuFrame(3300, 6);
    probe.recordGpuDisjoint();

    const report = probe.stop(0);

    expect(report.gpu.available).toBe(true);
    expect(report.gpu.samples).toBe(3);
    expect(report.gpu.disjointCount).toBe(1);
    expect(report.gpu.meanMs).toBe(30);
    expect(report.gpu.p50Ms).toBe(6);
    expect(report.gpu.maxMs).toBe(80);
    expect(report.gpu.worst[0]).toEqual({ atMs: 200, durationMs: 80 });
  });

  it("drops GPU queries submitted before the capture started", () => {
    const probe = new RenderMetricsProbe({ clock: () => 3000 });
    probe.start(0);
    probe.noteGpuAvailability(true);

    // A query left in flight by an earlier session, delivered on this
    // capture's first poll: its submit time predates the capture.
    probe.recordGpuFrame(2000, 12);
    probe.recordGpuFrame(3100, 4);

    const report = probe.stop(0);

    expect(report.gpu.samples).toBe(1);
    expect(report.gpu.worst[0]).toEqual({ atMs: 100, durationMs: 4 });
  });

  it("ignores GPU records outside a capture window and resets on restart", () => {
    const probe = new RenderMetricsProbe({ clock: () => 0 });
    probe.recordGpuFrame(10, 5);
    probe.noteGpuAvailability(true);

    probe.start(0);
    probe.noteGpuAvailability(true);
    probe.recordGpuFrame(1, 5);
    probe.stop(0);

    probe.start(0);
    const report = probe.stop(0);

    expect(report.gpu.samples).toBe(0);
    expect(report.gpu.available).toBe(false);
  });

  it("summarises long tasks capture-relative and disconnects on stop", () => {
    const source = manualLongTaskSource();
    const probe = new RenderMetricsProbe({
      clock: () => 2000,
      longTaskSource: source,
    });
    probe.start(0);

    // Entries arrive on the shared performance timeline (start = 2000).
    source.emit(2100, 60);
    source.emit(2500, 130);

    const report = probe.stop(0);

    expect(report.longTasks.available).toBe(true);
    expect(report.longTasks.count).toBe(2);
    expect(report.longTasks.totalMs).toBe(190);
    expect(report.longTasks.maxMs).toBe(130);
    expect(report.longTasks.worst).toEqual([
      { atMs: 500, durationMs: 130 },
      { atMs: 100, durationMs: 60 },
    ]);
    expect(source.disconnected()).toBe(true);
  });

  it("ignores long tasks delivered outside a capture window", () => {
    const source = manualLongTaskSource();
    const probe = new RenderMetricsProbe({
      clock: () => 0,
      longTaskSource: source,
    });
    probe.start(0);
    probe.stop(0);

    // The observer callback may straggle after disconnect; nothing records.
    source.emit(10, 60);

    probe.start(0);
    const report = probe.stop(0);
    expect(report.longTasks.count).toBe(0);
  });
});
