import { describe, expect, it } from "vitest";

import {
  createEngineFrame,
  createEngineFrameLayout,
} from "../frames/internal-frame";
import {
  createInMemoryEventTraceStore,
  findLastEventIndexAt,
} from "./trace-store";

import type { SDCPN } from "../../types/sdcpn";
import type { TraceEvent } from "./trace";

const sdcpn: SDCPN = {
  places: [
    {
      id: "level",
      name: "Level",
      colorId: "real",
      dynamicsEnabled: true,
      differentialEquationId: "de",
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [
    {
      id: "real",
      name: "Real",
      iconSlug: "circle",
      displayColor: "#000",
      elements: [{ elementId: "x", name: "x", type: "real" }],
    },
  ],
  differentialEquations: [],
  parameters: [],
};

const layout = createEngineFrameLayout(sdcpn);

const eventAt = (
  index: number,
  time: number,
  value: number,
  slope: number,
): TraceEvent => ({
  index,
  time,
  kind: index === 0 ? "initial" : "reference",
  firedTransitionIds: [],
  touchedPlaceIndices: new Uint32Array(),
  frame: createEngineFrame(layout, {
    places: { level: { byteOffset: 0, count: 1, strideBytes: 8 } },
    transitions: {},
    buffer: new Uint8Array(new Float64Array([value]).buffer),
  }),
  derivatives: [Float64Array.from([slope])],
});

describe("findLastEventIndexAt", () => {
  const events = [{ time: 0 }, { time: 1 }, { time: 1 }, { time: 2.5 }];

  it("finds the last event at or before a time", () => {
    expect(findLastEventIndexAt(events, -1)).toBe(-1);
    expect(findLastEventIndexAt(events, 0)).toBe(0);
    expect(findLastEventIndexAt(events, 0.5)).toBe(0);
    expect(findLastEventIndexAt(events, 1)).toBe(2);
    expect(findLastEventIndexAt(events, 2)).toBe(2);
    expect(findLastEventIndexAt(events, 2.5)).toBe(3);
    expect(findLastEventIndexAt(events, 10)).toBe(3);
    expect(findLastEventIndexAt([], 0)).toBe(-1);
  });
});

describe("createInMemoryEventTraceStore", () => {
  const level = (
    store: ReturnType<typeof createInMemoryEventTraceStore>,
    time: number,
  ) => store.getStateAt(time)?.getPlaceTokens(sdcpn.places[0]!)[0]?.x;

  it("reads recorded states as recorded and interpolates between them", () => {
    const store = createInMemoryEventTraceStore(sdcpn);
    // x = t² between t = 0 and t = 2, then held with slope 4.
    store.append([eventAt(0, 0, 0, 0), eventAt(1, 2, 4, 4)]);

    expect(store.count()).toBe(2);
    expect(store.getStateAt(-1)).toBeNull();
    expect(store.getEventState(1)?.time).toBe(2);
    expect(level(store, 0)).toBe(0);
    expect(level(store, 1)).toBeCloseTo(1, 12);
    expect(level(store, 2)).toBe(4);
    expect(level(store, 3)).toBe(8);
    expect(store.getStateAt(1)?.number).toBe(0);
    expect(store.getStateAt(1)?.time).toBe(1);
  });

  it("refuses events out of order", () => {
    const store = createInMemoryEventTraceStore(sdcpn);
    store.append([eventAt(0, 0, 0, 0)]);
    expect(() => store.append([eventAt(2, 1, 0, 0)])).toThrow(/out of order/);
  });

  it("applies string pool deltas in order and clears with the events", () => {
    const store = createInMemoryEventTraceStore(sdcpn);
    store.append([
      { ...eventAt(0, 0, 0, 0), newStrings: { baseId: 1, values: ["a"] } },
    ]);
    expect(() =>
      store.append([
        { ...eventAt(1, 1, 0, 0), newStrings: { baseId: 5, values: ["b"] } },
      ]),
    ).toThrow(/out of order/);

    store.clear();
    expect(store.count()).toBe(0);
    expect(store.latest()).toBeNull();
    store.append([
      { ...eventAt(0, 0, 0, 0), newStrings: { baseId: 1, values: ["a"] } },
    ]);
    expect(store.latest()?.index).toBe(0);
  });
});
