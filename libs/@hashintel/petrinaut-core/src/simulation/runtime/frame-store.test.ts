import { describe, expect, it } from "vitest";

import {
  createEngineFrame,
  createEngineFrameLayout,
  type EngineFrame,
} from "../frames/internal-frame";
import { createInMemorySimulationFrameStore } from "./frame-store";

import type { Color, Place, SDCPN } from "../../types/sdcpn";
import type { SimulationFramePayload } from "../worker/frame-payload";

const color: Color = {
  id: "color-1",
  name: "Labelled",
  iconSlug: "circle",
  displayColor: "#000000",
  elements: [
    { elementId: "label", name: "label", type: "string" },
    { elementId: "x", name: "x", type: "real" },
  ],
};

const place: Place = {
  id: "place-1",
  name: "Place 1",
  colorId: color.id,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

const sdcpn: Pick<SDCPN, "places" | "transitions" | "types"> = {
  places: [place],
  transitions: [],
  types: [color],
};

const layout = createEngineFrameLayout(sdcpn);

/** One-token frame whose string field holds the given pool id. */
function makeFrame(poolId: bigint, x: number): EngineFrame {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);
  view.setBigUint64(0, poolId, true);
  view.setFloat64(8, x, true);

  return createEngineFrame(layout, {
    places: { [place.id]: { byteOffset: 0, count: 1, strideBytes: 16 } },
    transitions: {},
    buffer,
  });
}

describe("createInMemorySimulationFrameStore string pool accumulation", () => {
  it("applies newStrings deltas in order and decodes string fields", () => {
    const store = createInMemorySimulationFrameStore(sdcpn);

    store.appendBatch([
      {
        time: 0,
        frame: makeFrame(1n, 1.5),
        newStrings: { baseId: 1, values: ["alpha"] },
      },
      { time: 0.1, frame: makeFrame(1n, 2.5) },
      {
        time: 0.2,
        frame: makeFrame(2n, 3.5),
        newStrings: { baseId: 2, values: ["beta"] },
      },
    ]);

    expect(store.count()).toBe(3);
    expect(store.get(0)!.getPlaceTokens(place)).toEqual([
      { label: "alpha", x: 1.5 },
    ]);
    expect(store.get(1)!.getPlaceTokens(place)).toEqual([
      { label: "alpha", x: 2.5 },
    ]);
    expect(store.latest()!.getPlaceTokens(place)).toEqual([
      { label: "beta", x: 3.5 },
    ]);
  });

  it("decodes a zeroed string field to the pre-seeded empty string", () => {
    const store = createInMemorySimulationFrameStore(sdcpn);

    store.append({ time: 0, frame: makeFrame(0n, 1) });

    expect(store.latest()!.getPlaceTokens(place)).toEqual([
      { label: "", x: 1 },
    ]);
  });

  it("rejects out-of-order deltas", () => {
    const store = createInMemorySimulationFrameStore(sdcpn);

    expect(() =>
      store.append({
        time: 0,
        frame: makeFrame(0n, 1),
        newStrings: { baseId: 2, values: ["stray"] },
      }),
    ).toThrow("string pool delta out of order: baseId 2, expected 1");
  });

  it("clear() resets the accumulated pool along with the frames", () => {
    const store = createInMemorySimulationFrameStore(sdcpn);
    store.append({
      time: 0,
      frame: makeFrame(1n, 1),
      newStrings: { baseId: 1, values: ["alpha"] },
    });

    store.clear();
    expect(store.count()).toBe(0);

    // A fresh run's first delta starts at baseId 1 again ("" is pre-seeded).
    store.append({
      time: 0,
      frame: makeFrame(1n, 2),
      newStrings: { baseId: 1, values: ["gamma"] },
    });
    expect(store.latest()!.getPlaceTokens(place)).toEqual([
      { label: "gamma", x: 2 },
    ]);
  });

  const payloadAt = (time: number): SimulationFramePayload => ({
    time,
    frame: makeFrame(0n, time),
  });

  it("keeps plain payloads working with no deltas at all", () => {
    const store = createInMemorySimulationFrameStore(sdcpn);
    store.appendBatch([payloadAt(0), payloadAt(0.1)]);

    expect(store.count()).toBe(2);
    expect(store.latest()!.getPlaceTokenCount(place.id)).toBe(1);
  });
});
