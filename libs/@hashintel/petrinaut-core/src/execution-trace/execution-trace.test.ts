import { describe, expect, it, vi } from "vitest";

import { wallClockMsAt } from "./execution-trace";
import { createQueueTrace } from "./trace.test-helpers";

describe("createExecutionTrace", () => {
  it("covers from its first event to its last", () => {
    const { trace, finish } = createQueueTrace();
    finish(2);
    finish(5);

    expect(trace.coverage.get()).toEqual({
      eventCount: 3,
      startTime: 0,
      coveredTime: 5,
      ended: false,
    });
    expect(trace.getStateAt(1)?.getPlaceTokenCount("queued")).toBe(3);
    expect(trace.getStateAt(2)?.getPlaceTokenCount("queued")).toBe(2);
    expect(trace.getStateAt(5)?.getPlaceTokenCount("done")).toBe(2);
  });

  it("is covered past its last event when the source says nothing happened since", () => {
    const { trace, writer, finish } = createQueueTrace();
    finish(2);
    writer.cover(8);
    // Coverage never moves back.
    writer.cover(6);

    expect(trace.coverage.get().coveredTime).toBe(8);
    expect(trace.getStateAt(8)?.getPlaceTokenCount("queued")).toBe(2);
  });

  it("starts where its first event is, as a trace that joins an execution under way", () => {
    const { trace, finish } = createQueueTrace({ startTime: -30 });
    finish(-10);

    expect(trace.coverage.get()).toMatchObject({
      startTime: -30,
      coveredTime: -10,
    });
    expect(trace.getStateAt(-31)).toBeNull();
    expect(trace.getStateAt(-20)?.getPlaceTokenCount("queued")).toBe(3);
  });

  it("notifies its readers as it grows and once it ends", () => {
    const { trace, writer, finish } = createQueueTrace();
    const seen = vi.fn();
    trace.coverage.subscribe(seen);

    finish(1);
    writer.end();

    expect(seen).toHaveBeenCalledTimes(2);
    expect(trace.coverage.get().ended).toBe(true);
    expect(() => finish(2)).toThrow(/takes no more events/);
  });

  it("passes what is asked of it on to its source", () => {
    const onDemand = vi.fn();
    const { trace } = createQueueTrace({ onDemand });
    trace.demand(4);
    expect(onDemand).toHaveBeenCalledWith(4);
  });

  it("asks nothing of a source that reports on its own", () => {
    const { trace } = createQueueTrace();
    expect(() => trace.demand(4)).not.toThrow();
  });
});

describe("wallClockMsAt", () => {
  const epochMs = Date.parse("2026-06-05T10:00:00.000Z");

  it("places a position on the wall clock from the trace's epoch", () => {
    const { trace } = createQueueTrace({ epochMs });
    expect(new Date(wallClockMsAt(trace, 90.5)!).toISOString()).toBe(
      "2026-06-05T10:01:30.500Z",
    );
    expect(new Date(wallClockMsAt(trace, -60)!).toISOString()).toBe(
      "2026-06-05T09:59:00.000Z",
    );
  });

  it("has no wall clock for an execution with no place in real time", () => {
    const { trace } = createQueueTrace();
    expect(trace.epochMs).toBeNull();
    expect(wallClockMsAt(trace, 90)).toBeNull();
  });

  it("has no wall clock for a count of steps", () => {
    expect(wallClockMsAt({ clock: "steps", epochMs }, 3)).toBeNull();
  });
});
