import { describe, expect, it } from "vitest";

import { createExecutionTrace } from "./execution-trace";
import { createTraceEncoder } from "./trace-encoder";
import { queueNet } from "./trace.test-helpers";

import type { SDCPN } from "../types/sdcpn";

const parcelNet: SDCPN = {
  ...queueNet,
  places: [
    { ...queueNet.places[0]!, id: "depot", name: "Depot", colorId: "parcel" },
    { ...queueNet.places[1]!, id: "shipped", name: "Shipped", colorId: null },
  ],
  transitions: [{ ...queueNet.transitions[0]!, id: "ship", name: "Ship" }],
  types: [
    {
      id: "parcel",
      name: "Parcel",
      iconSlug: "circle",
      displayColor: "#00FF00",
      elements: [
        { elementId: "weight", name: "weight", type: "real" },
        { elementId: "label", name: "label", type: "string" },
      ],
    },
  ],
};

const traceOf = (net: SDCPN) => {
  const encoder = createTraceEncoder(net);
  const { trace, writer } = createExecutionTrace({
    net,
    clock: "time",
    continuity: "discrete",
  });
  return { encoder, trace, writer };
};

describe("createTraceEncoder", () => {
  it("records a firing as its effect on the state before it", () => {
    const { encoder, trace, writer } = traceOf(queueNet);
    writer.append([
      encoder.state(0, { queued: 2 }, "initial"),
      encoder.firing(4, {
        transitionIds: ["finish"],
        consumed: { queued: 1 },
        produced: { done: 1 },
      }),
    ]);

    const event = trace.getEvent(1)!;
    expect(event).toMatchObject({
      index: 1,
      time: 4,
      kind: "firing",
      firedTransitionIds: ["finish"],
    });
    expect([...event.touchedPlaceIndices]).toEqual([0, 1]);
    expect(trace.getEventState(1)?.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
  });

  it("counts a transition's firings and the time since its last one", () => {
    const { encoder, trace, writer } = traceOf(queueNet);
    writer.append([
      encoder.state(10, { queued: 3 }, "initial"),
      encoder.firing(12, { transitionIds: ["finish"] }),
      encoder.state(15, { queued: 3 }),
      encoder.firing(15.5, { transitionIds: ["finish"] }),
    ]);

    const states = [0, 1, 2, 3].map((index) =>
      trace.getEventState(index)!.getTransitionState("finish"),
    );
    expect(states).toEqual([
      { firedInThisFrame: false, firingCount: 0, timeSinceLastFiringMs: 0 },
      { firedInThisFrame: true, firingCount: 1, timeSinceLastFiringMs: 0 },
      { firedInThisFrame: false, firingCount: 1, timeSinceLastFiringMs: 3000 },
      { firedInThisFrame: true, firingCount: 2, timeSinceLastFiringMs: 0 },
    ]);
  });

  it("keeps the tokens of a coloured place, takes the oldest first and ships their strings", () => {
    const { encoder, trace, writer } = traceOf(parcelNet);
    const depot = parcelNet.places[0]!;
    writer.append([
      encoder.state(0, { depot: [{ weight: 1.5, label: "first" }] }, "initial"),
      encoder.firing(1, {
        transitionIds: [],
        produced: { depot: [{ weight: 4, label: "second" }] },
      }),
      encoder.firing(2, {
        transitionIds: ["ship"],
        consumed: { depot: 1 },
        produced: { shipped: 1 },
      }),
    ]);

    expect(trace.getEvent(0)?.newStrings).toEqual({
      baseId: 1,
      values: ["first"],
    });
    expect(trace.getEventState(1)?.getPlaceTokens(depot)).toEqual([
      { weight: 1.5, label: "first" },
      { weight: 4, label: "second" },
    ]);
    expect(trace.getEventState(2)?.getPlaceTokens(depot)).toEqual([
      { weight: 4, label: "second" },
    ]);
    expect(trace.getEventState(2)?.getPlaceTokenCount("shipped")).toBe(1);
  });

  it("gives default values to the tokens a count stands for in a coloured place", () => {
    const { encoder, trace, writer } = traceOf(parcelNet);
    writer.append([encoder.state(0, { depot: 2 }, "initial")]);

    expect(
      trace.getEventState(0)?.getPlaceTokens(parcelNet.places[0]!),
    ).toEqual([
      { weight: 0, label: "" },
      { weight: 0, label: "" },
    ]);
  });

  it.each([
    { marking: -1, expected: 0 },
    { marking: 2.9, expected: 2 },
  ])(
    "reads a count of $marking as $expected tokens",
    ({ marking, expected }) => {
      const { encoder, trace, writer } = traceOf(queueNet);
      writer.append([encoder.state(0, { queued: marking }, "initial")]);

      const state = trace.getEventState(0)!;
      expect(state.getPlaceTokenCount("queued")).toBe(expected);
      expect(state.getRawView?.().placeCounts[0]).toBe(expected);
    },
  );

  it("never takes more tokens than a place holds", () => {
    const { encoder, trace, writer } = traceOf(queueNet);
    writer.append([
      encoder.state(0, { queued: 1 }, "initial"),
      encoder.firing(1, { transitionIds: ["finish"], consumed: { queued: 5 } }),
    ]);
    expect(trace.getEventState(1)?.getPlaceTokenCount("queued")).toBe(0);
  });

  it("skips a place and a transition the net does not have", () => {
    const { encoder, trace, writer } = traceOf(queueNet);
    writer.append([
      encoder.state(0, { queued: 1, elsewhere: 4 }, "initial"),
      encoder.firing(1, {
        transitionIds: ["finish", "unknown"],
        consumed: { elsewhere: 1 },
        produced: { done: 1 },
      }),
    ]);

    expect(trace.getEvent(1)?.firedTransitionIds).toEqual(["finish"]);
    expect(trace.getEventState(1)?.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
  });

  it("refuses an event earlier than the one before it", () => {
    const { encoder } = traceOf(queueNet);
    encoder.state(5, { queued: 1 }, "initial");
    expect(() => encoder.firing(4, { transitionIds: ["finish"] })).toThrow(
      /in order of time/,
    );
  });
});
