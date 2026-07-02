/**
 * GpuFrameTimer tests over a scripted fake WebGL2 context: extension
 * detection, asynchronous result delivery in submit order, disjoint
 * discard, and query-object pooling.
 */
import { describe, expect, it } from "vitest";

import { GpuFrameTimer } from "./gpu-frame-timer";

const TIME_ELAPSED_EXT = 0x88bf;
const GPU_DISJOINT_EXT = 0x8fbb;
const QUERY_RESULT_AVAILABLE = 0x8867;
const QUERY_RESULT = 0x8866;

/** Fake WebGL2 context: queries complete when the test says so. */
class FakeGl {
  readonly QUERY_RESULT_AVAILABLE = QUERY_RESULT_AVAILABLE;
  readonly QUERY_RESULT = QUERY_RESULT;

  hasExtension = true;
  disjoint = false;
  createdCount = 0;

  /** Query -> result in nanoseconds, or null while still pending. */
  readonly #results = new Map<WebGLQuery, number | null>();
  #active: WebGLQuery | null = null;

  getExtension(name: string): unknown {
    if (name !== "EXT_disjoint_timer_query_webgl2" || !this.hasExtension) {
      return null;
    }
    return { TIME_ELAPSED_EXT, GPU_DISJOINT_EXT };
  }

  createQuery(): WebGLQuery {
    this.createdCount += 1;
    return { fakeQuery: this.createdCount } as unknown as WebGLQuery;
  }

  beginQuery(_target: number, query: WebGLQuery): void {
    this.#active = query;
    this.#results.set(query, null);
  }

  endQuery(_target: number): void {
    this.#active = null;
  }

  getParameter(parameter: number): unknown {
    return parameter === GPU_DISJOINT_EXT ? this.disjoint : undefined;
  }

  getQueryParameter(query: WebGLQuery, parameter: number): unknown {
    if (parameter === QUERY_RESULT_AVAILABLE) {
      return this.#results.get(query) !== null;
    }
    return this.#results.get(query) ?? 0;
  }

  /** Test hook: mark the query's result ready (nanoseconds). */
  finish(query: WebGLQuery, nanoseconds: number): void {
    this.#results.set(query, nanoseconds);
  }

  get lastBegun(): WebGLQuery | null {
    return this.#active;
  }
}

const asContext = (fake: FakeGl): WebGL2RenderingContext =>
  fake as unknown as WebGL2RenderingContext;

interface Recorded {
  readonly samples: { submittedAtMs: number; durationMs: number }[];
  disjoints: number;
}

function timerOver(clockTimes: number[]): {
  timer: GpuFrameTimer;
  recorded: Recorded;
} {
  const recorded: Recorded = { samples: [], disjoints: 0 };
  const timer = new GpuFrameTimer(
    (submittedAtMs, durationMs) => {
      recorded.samples.push({ submittedAtMs, durationMs });
    },
    () => {
      recorded.disjoints += 1;
    },
    () => clockTimes.shift() ?? 0,
  );
  return { timer, recorded };
}

describe("GpuFrameTimer", () => {
  it("reports unavailability once probed and never samples", () => {
    const fake = new FakeGl();
    fake.hasExtension = false;
    const { timer, recorded } = timerOver([0]);

    expect(timer.available).toBeNull();
    timer.frameBegin(asContext(fake));
    timer.frameEnd();

    expect(timer.available).toBe(false);
    expect(recorded.samples).toEqual([]);
  });

  it("delivers completed queries in submit order with submit timestamps", () => {
    const fake = new FakeGl();
    const { timer, recorded } = timerOver([100, 116, 132]);

    timer.frameBegin(asContext(fake));
    const first = fake.lastBegun!;
    timer.frameEnd();
    timer.frameBegin(asContext(fake));
    const second = fake.lastBegun!;
    timer.frameEnd();

    // Nothing ready yet: a poll delivers no samples.
    timer.poll();
    expect(recorded.samples).toEqual([]);

    // 4ms and 80ms, in nanoseconds; both become ready.
    fake.finish(first, 4e6);
    fake.finish(second, 80e6);
    timer.poll();

    expect(recorded.samples).toEqual([
      { submittedAtMs: 100, durationMs: 4 },
      { submittedAtMs: 116, durationMs: 80 },
    ]);
    expect(timer.available).toBe(true);
  });

  it("stops polling at the first unavailable result (submit order holds)", () => {
    const fake = new FakeGl();
    const { timer, recorded } = timerOver([0, 16]);

    timer.frameBegin(asContext(fake));
    const first = fake.lastBegun!;
    timer.frameEnd();
    timer.frameBegin(asContext(fake));
    const second = fake.lastBegun!;
    timer.frameEnd();

    // Only the SECOND is ready; the first must still block delivery.
    fake.finish(second, 5e6);
    timer.poll();
    expect(recorded.samples).toEqual([]);

    fake.finish(first, 3e6);
    timer.poll();
    expect(recorded.samples.map((sample) => sample.durationMs)).toEqual([3, 5]);
  });

  it("discards in-flight queries on a disjoint event", () => {
    const fake = new FakeGl();
    const { timer, recorded } = timerOver([0, 16]);

    timer.frameBegin(asContext(fake));
    const first = fake.lastBegun!;
    timer.frameEnd();
    fake.finish(first, 7e6);

    fake.disjoint = true;
    timer.poll();

    expect(recorded.disjoints).toBe(1);
    expect(recorded.samples).toEqual([]);

    // After the flag clears, later frames measure normally again.
    fake.disjoint = false;
    timer.frameBegin(asContext(fake));
    const next = fake.lastBegun!;
    timer.frameEnd();
    fake.finish(next, 9e6);
    timer.poll();
    expect(recorded.samples).toEqual([{ submittedAtMs: 16, durationMs: 9 }]);
  });

  it("pools completed query objects instead of re-creating", () => {
    const fake = new FakeGl();
    const { timer } = timerOver([0, 16, 32, 48]);

    for (let frame = 0; frame < 4; frame++) {
      timer.frameBegin(asContext(fake));
      const query = fake.lastBegun!;
      timer.frameEnd();
      fake.finish(query, 1e6);
      timer.poll();
    }

    // Every frame's query completed before the next began: one object suffices.
    expect(fake.createdCount).toBe(1);
  });
});
