import { describe, expect, it } from "vitest";

import { wallClockMsAt } from "../execution-trace/execution-trace";
import { compileHirArtifacts } from "../hir/compile";
import { createHirMetricEvaluator } from "../simulation/frames/hir-metric";
import { createActualModeTrace, getActualModeEpochMs } from "./execution-trace";

import type { SDCPN } from "../types/sdcpn";
import type { ActualModeTransitionFiring } from "./types";

const definition: SDCPN = {
  places: [
    {
      id: "queued",
      name: "Queued",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
    {
      id: "done",
      name: "Done",
      colorId: null,
      dynamicsEnabled: false,
      x: 100,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "finish",
      name: "Finish",
      inputArcs: [{ placeId: "queued", weight: 1, type: "standard" }],
      outputArcs: [{ placeId: "done", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "",
      transitionKernelCode: "",
      x: 50,
      y: 0,
    },
  ],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const finishAt = (ts: string): ActualModeTransitionFiring => ({
  transitionId: "finish",
  input: { queued: 1 },
  output: { done: 1 },
  ts,
});

const startedAtMs = Date.parse("2026-06-05T10:00:00.000Z");

describe("getActualModeEpochMs", () => {
  it("is when the host says the execution started", () => {
    expect(
      getActualModeEpochMs({
        timelineStartedAtMs: startedAtMs,
        transitionFirings: [finishAt("2026-06-05T10:00:07.000Z")],
      }),
    ).toBe(startedAtMs);
  });

  it("is the first firing's timestamp when the host gives no start", () => {
    expect(
      getActualModeEpochMs({
        timelineStartedAtMs: null,
        transitionFirings: [
          finishAt("not a date"),
          finishAt("2026-06-05T10:00:07.000Z"),
        ],
      }),
    ).toBe(startedAtMs + 7000);
  });

  it("is unknown until the host reports either", () => {
    expect(
      getActualModeEpochMs({
        timelineStartedAtMs: null,
        transitionFirings: [],
      }),
    ).toBeNull();
  });
});

describe("createActualModeTrace", () => {
  it("maps the initial state and each firing to an event at its timestamp", () => {
    const actual = createActualModeTrace({
      definition,
      initialState: { queued: 2, done: 0 },
      epochMs: startedAtMs,
    });
    actual.update({
      status: "streaming",
      transitionFirings: [finishAt("2026-06-05T10:00:07.500Z")],
      timelineNowMs: null,
    });

    const { trace } = actual;
    expect(trace).toMatchObject({ clock: "time", continuity: "discrete" });
    expect(trace.coverage.get()).toEqual({
      eventCount: 2,
      startTime: 0,
      coveredTime: 7.5,
      ended: false,
    });
    expect(trace.getEvent(1)).toMatchObject({
      kind: "firing",
      time: 7.5,
      firedTransitionIds: ["finish"],
    });
    expect(trace.getStateAt(3)?.toFrameState().places).toEqual({
      queued: { tokenCount: 2 },
      done: { tokenCount: 0 },
    });
    expect(trace.getStateAt(7.5)?.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
    expect(new Date(wallClockMsAt(trace, 7.5)!).toISOString()).toBe(
      "2026-06-05T10:00:07.500Z",
    );
  });

  it("appends only the firings it does not hold yet", () => {
    const actual = createActualModeTrace({
      definition,
      initialState: { queued: 3 },
      epochMs: startedAtMs,
    });
    const first = finishAt("2026-06-05T10:00:01.000Z");
    const second = finishAt("2026-06-05T10:00:02.000Z");

    actual.update({
      status: "streaming",
      transitionFirings: [first],
      timelineNowMs: null,
    });
    actual.update({
      status: "streaming",
      transitionFirings: [first],
      timelineNowMs: null,
    });
    actual.update({
      status: "streaming",
      transitionFirings: [first, second],
      timelineNowMs: null,
    });

    expect(actual.firingCount).toBe(2);
    expect(actual.trace.coverage.get().eventCount).toBe(3);
    expect(actual.trace.getStateAt(2)?.getPlaceTokenCount("done")).toBe(2);
  });

  it("covers the time the host says it is while the execution streams", () => {
    const actual = createActualModeTrace({
      definition,
      initialState: { queued: 3 },
      epochMs: startedAtMs,
    });
    actual.update({
      status: "streaming",
      transitionFirings: [finishAt("2026-06-05T10:00:01.000Z")],
      timelineNowMs: startedAtMs + 30_000,
    });
    expect(actual.trace.coverage.get().coveredTime).toBe(30);

    actual.update({
      status: "streaming",
      transitionFirings: [finishAt("2026-06-05T10:00:01.000Z")],
      timelineNowMs: startedAtMs + 45_000,
    });
    expect(actual.trace.coverage.get()).toMatchObject({
      eventCount: 2,
      coveredTime: 45,
    });
  });

  it("ends when the host's execution does", () => {
    const actual = createActualModeTrace({
      definition,
      initialState: { queued: 3 },
      epochMs: startedAtMs,
    });
    actual.update({
      status: "complete",
      transitionFirings: [finishAt("2026-06-05T10:00:01.000Z")],
      timelineNowMs: startedAtMs + 30_000,
    });
    expect(actual.trace.coverage.get()).toMatchObject({
      coveredTime: 1,
      ended: true,
    });
  });

  it("keeps the order of the host's list for timestamps it cannot place", () => {
    const actual = createActualModeTrace({
      definition,
      initialState: { queued: 3 },
      epochMs: startedAtMs,
    });
    actual.update({
      status: "streaming",
      transitionFirings: [
        finishAt("2026-06-05T10:00:05.000Z"),
        // Stamped before the firing it follows.
        finishAt("2026-06-05T10:00:03.000Z"),
        finishAt("not a date"),
      ],
      timelineNowMs: null,
    });
    expect(
      [1, 2, 3].map((index) => actual.trace.getEvent(index)?.time),
    ).toEqual([5, 5, 5.001]);
  });

  it("keeps a count in a coloured place readable by a metric", () => {
    const colouredDefinition = {
      ...definition,
      places: [
        {
          ...definition.places[0]!,
          id: "items",
          name: "Items",
          colorId: "item",
        },
      ],
      transitions: [],
      types: [
        {
          id: "item",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#00FF00",
          elements: [{ elementId: "value", name: "value", type: "real" }],
        },
      ],
      metrics: [
        {
          id: "item-count",
          name: "Item count",
          code: "return state.places.Items.tokens.length;",
        },
      ],
    } satisfies SDCPN;
    const { trace } = createActualModeTrace({
      definition: colouredDefinition,
      initialState: { items: 2.9 },
      epochMs: null,
    });
    const reader = trace.getStateAt(0)!;

    const { artifacts, failures } = compileHirArtifacts(colouredDefinition);
    expect(failures).toEqual([]);
    const evaluate = createHirMetricEvaluator({
      metricName: "Item count",
      artifact: artifacts.metrics["item-count"]!,
      places: colouredDefinition.places,
    });

    const tokens = reader.getPlaceTokens(colouredDefinition.places[0]!);
    expect(reader.getPlaceTokenCount("items")).toBe(2);
    expect(tokens).toEqual([{ value: 0 }, { value: 0 }]);
    expect(evaluate(reader)).toBe(tokens.length);
  });
});
