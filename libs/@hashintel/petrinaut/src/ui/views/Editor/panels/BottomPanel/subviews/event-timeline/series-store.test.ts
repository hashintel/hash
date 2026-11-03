import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createTimelineSeriesStore,
  niceStep,
  TRACE_UPDATE_INTERVAL_MS,
} from "./series-store";

import type { TimelineSeriesSource } from "./series-store";
import type {
  SimulationFrameReader,
  TraceEvent,
} from "@hashintel/petrinaut-core";

type Fake = { time: number; kind: TraceEvent["kind"]; fired: string[] };

/**
 * A trace whose "state" is the time it was read at, with a flag for reads
 * past the last event, so a sample can tell whether it was extrapolated.
 */
const createSource = (initial: Fake[]) => {
  const events = [...initial];
  const listeners = new Set<
    (value: { eventCount: number; coveredTime: number; latest: null }) => void
  >();
  let coveredTime = events[events.length - 1]?.time ?? 0;
  const summary = () => ({
    eventCount: events.length,
    coveredTime,
    latest: null,
  });
  const reader = (time: number, extrapolated: boolean) =>
    ({ time, extrapolated }) as unknown as SimulationFrameReader;
  const source: TimelineSeriesSource = {
    getEvent: (index) => {
      const event = events[index];
      return event
        ? ({
            index,
            time: event.time,
            kind: event.kind,
            firedTransitionIds: event.fired,
          } as unknown as TraceEvent)
        : null;
    },
    getEventState: (index) =>
      events[index] ? reader(events[index]!.time, false) : null,
    getStateAt: (time) => {
      const last = events[events.length - 1];
      return last ? reader(time, time >= last.time) : null;
    },
    trace: {
      get: summary,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
  const append = (more: Fake[], covered: number) => {
    events.push(...more);
    coveredTime = covered;
    for (const listener of listeners) listener(summary());
    vi.advanceTimersByTime(TRACE_UPDATE_INTERVAL_MS);
  };
  return { source, append };
};

const extract = (
  frame: SimulationFrameReader,
  seriesIndex: number,
  time: number,
) => {
  const { extrapolated } = frame as unknown as { extrapolated: boolean };
  return extrapolated ? -1 : time * 10 + seriesIndex;
};
const series = [
  { seriesId: "a", seriesName: "A", color: "#000" },
  { seriesId: "b", seriesName: "B", color: "#000" },
];

describe("createTimelineSeriesStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("takes the trace's updates at most once per interval", () => {
    const { source, append } = createSource([
      { time: 0, kind: "initial", fired: [] },
    ]);
    const store = createTimelineSeriesStore(source, {
      kind: "steps",
      series,
      extract,
    });
    let notified = 0;
    store.subscribe(() => {
      notified += 1;
    });
    store.attach();
    expect(notified).toBe(1);
    // Two updates inside one interval reach the chart as one.
    const before = store.getSnapshot();
    source.trace.get();
    append([{ time: 0.1, kind: "firing", fired: ["t1"] }], 0.1);
    expect(notified).toBe(2);
    expect(store.getSnapshot()).not.toBe(before);
    expect(store.getSnapshot().data?.data[0]).toEqual([0, 0.1]);
  });

  it("builds step rows once per event and carries them to the covered time", () => {
    const { source, append } = createSource([
      { time: 0, kind: "initial", fired: [] },
      { time: 0.15, kind: "firing", fired: ["t1"] },
    ]);
    const store = createTimelineSeriesStore(source, {
      kind: "steps",
      series,
      extract,
    });
    const detach = store.attach();
    let snapshot = store.getSnapshot();
    expect(snapshot.data?.data[0]).toEqual([0, 0.15]);
    expect(snapshot.data?.data[1]).toEqual([0, 1.5]);
    expect(snapshot.firings.map((firing) => firing.time)).toEqual([0.15]);

    append([{ time: 0.25, kind: "reference", fired: [] }], 0.3);
    snapshot = store.getSnapshot();
    expect(snapshot.data?.data[0]).toEqual([0, 0.15, 0.25, 0.3]);
    expect(snapshot.data?.data[2]).toEqual([1, 2.5, 3.5, 3.5]);
    expect(snapshot.references).toEqual([0.25]);

    append([{ time: 0.4, kind: "firing", fired: ["t2"] }], 0.4);
    snapshot = store.getSnapshot();
    expect(snapshot.data?.data[0]).toEqual([0, 0.15, 0.25, 0.4]);
    expect(snapshot.firings.map((firing) => firing.time)).toEqual([0.15, 0.4]);
    detach();
  });

  it("keeps a lane per transition with a row per firing", () => {
    const { source, append } = createSource([
      { time: 0, kind: "initial", fired: [] },
      { time: 0.15, kind: "firing", fired: ["t1"] },
    ]);
    const transitions = [
      { id: "t1", name: "One" },
      { id: "t2", name: "Two" },
    ] as never;
    const store = createTimelineSeriesStore(source, {
      kind: "lanes",
      transitions,
    });
    store.attach();
    append([{ time: 0.4, kind: "firing", fired: ["t2"] }], 0.4);
    const data = store.getSnapshot().data;
    expect(data?.kind).toBe("lanes");
    expect(data?.data).toEqual([
      [0.15, 0.4],
      [1, null],
      [null, 0],
    ]);
    if (data?.kind === "lanes") {
      expect(data.laneLabels).toEqual(["Two", "One"]);
    }
  });

  it("samples on a round grid, keeps settled cells and re-reads extrapolated ones", () => {
    const { source, append } = createSource([
      { time: 0, kind: "initial", fired: [] },
      { time: 0.5, kind: "firing", fired: ["t1"] },
    ]);
    const store = createTimelineSeriesStore(source, {
      kind: "sampled",
      series,
      extract,
      sampleCount: 10,
    });
    store.attach();
    store.setViewRange(0, 0.5);
    let data = store.getSnapshot().data!.data;
    expect(data[0]).toEqual(
      [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5].map(
        (t) => Math.round(t * 100) / 100,
      ),
    );
    expect(data[1]![0]).toBe(0);
    expect(data[1]![10]).toBe(-1);

    // The run covers more without a new event: the cell at the last event stays extrapolated.
    append([], 0.8);
    store.setViewRange(0, 0.8);
    data = store.getSnapshot().data!.data;
    expect(data[0]!.length).toBe(17);
    expect(data[1]![16]).toBe(-1);

    // A later event settles the cells before it.
    append([{ time: 0.9, kind: "firing", fired: ["t1"] }], 0.9);
    store.setViewRange(0, 0.9);
    data = store.getSnapshot().data!.data;
    expect(data[1]![10]).toBe(5);
    expect(data[1]![16]).toBe(8);
    expect(data[1]![18]).toBe(-1);
  });

  it("rounds a step down to one, two or five times a power of ten", () => {
    expect(niceStep(0.037)).toBe(0.02);
    expect(niceStep(0.5)).toBe(0.5);
    expect(niceStep(0.6)).toBe(0.5);
    expect(niceStep(3)).toBe(2);
    expect(niceStep(12)).toBe(10);
  });
});
