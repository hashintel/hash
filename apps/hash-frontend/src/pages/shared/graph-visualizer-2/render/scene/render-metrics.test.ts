import { describe, expect, it } from "vitest";

import { RenderMetricsProbe } from "./render-metrics";

import type { DeckMetrics } from "./render-metrics";

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
  return new RenderMetricsProbe(() => times.shift() ?? 0);
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
});
