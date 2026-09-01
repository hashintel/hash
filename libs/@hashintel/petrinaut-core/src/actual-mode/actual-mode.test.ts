import { describe, expect, it } from "vitest";

import {
  createActualModeReceivedEventsRecording,
  createActualModeRecording,
  createActualModeTimelineFrameReader,
  getActualModeMarkingAtTransitionFiringIndex,
  parseActualModeRecording,
  retimeActualModeRecordingForReplay,
} from ".";
import { compileHirArtifacts } from "../hir/compile";
import { createHirMetricEvaluator } from "../simulation/frames/hir-metric";

import type { SDCPN } from "../types/sdcpn";

const definition: SDCPN = {
  places: [
    {
      id: "queued",
      name: "Queued",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

describe("Actual mode recordings", () => {
  it("parses exported recordings", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: {
        kind: "brunch",
        endpoint: "http://127.0.0.1:5184/stream",
      },
      definition,
      initialState: { queued: 1 },
      transitionFirings: [
        {
          transitionId: "start",
          input: { queued: 1 },
          output: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(parseActualModeRecording(recording)).toEqual(recording);
  });

  it("exports raw received events without mapping to SDCPN", () => {
    const rawDefinition = {
      title: "Raw Brunch run",
      places: [{ id: "queued", name: "Queued" }],
      transitions: [],
    };

    const recording = createActualModeReceivedEventsRecording({
      title: "Replay",
      source: null,
      events: [{ event: "definition", data: rawDefinition }],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(recording).toEqual({
      version: 2,
      exportedAt: "2026-06-05T10:01:00.000Z",
      title: "Replay",
      source: null,
      events: [{ event: "definition", data: rawDefinition }],
    });
  });

  it("parses recordings whose firings carry token values", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: null,
      definition,
      initialState: { queued: 1 },
      transitionFirings: [
        {
          transitionId: "start",
          input: { queued: 1 },
          output: { implementing: 1 },
          inputTokens: { queued: [{ ticket_id: "a" }] },
          outputTokens: { implementing: [{ ticket_id: "a", attempts: 1 }] },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(recording.version).toBe(2);
    expect(parseActualModeRecording(recording)).toEqual(recording);
  });

  it("still parses version-1 recordings without token values", () => {
    const parsed = parseActualModeRecording({
      version: 1,
      exportedAt: "2026-06-05T10:01:00.000Z",
      title: "Replay",
      source: null,
      definition,
      initialState: { queued: 1 },
      transitionFirings: [
        {
          transitionId: "start",
          input: { queued: 1 },
          output: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
    });

    expect(parsed.version).toBe(1);
  });

  it("rejects unsupported recording versions", () => {
    expect(() =>
      parseActualModeRecording({
        version: 3,
        exportedAt: "2026-06-05T10:01:00.000Z",
        title: "Replay",
        source: null,
        definition,
        initialState: { queued: 1 },
        transitionFirings: [],
      }),
    ).toThrow();
  });

  it("retimes transition firings relative to the first event", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: null,
      definition,
      initialState: { queued: 2 },
      transitionFirings: [
        {
          transitionId: "first",
          input: { queued: 1 },
          output: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
        {
          transitionId: "second",
          input: { queued: 1 },
          output: {},
          ts: "2026-06-05T10:00:03.250Z",
        },
      ],
    });

    const retimed = retimeActualModeRecordingForReplay(
      recording,
      Date.parse("2026-06-05T12:00:00.000Z"),
    );

    expect(retimed.transitionFirings.map((firing) => firing.ts)).toEqual([
      "2026-06-05T12:00:00.000Z",
      "2026-06-05T12:00:03.250Z",
    ]);
  });

  it("rejects transition firings with extra fields", () => {
    expect(() =>
      parseActualModeRecording({
        version: 1,
        exportedAt: "2026-06-05T10:01:00.000Z",
        title: "Replay",
        source: null,
        definition,
        initialState: { queued: 1, done: 0 },
        transitionFirings: [
          {
            transitionId: "finish",
            input: { queued: 1 },
            output: { done: 1 },
            unsupported: { done: 1 },
            ts: "2026-06-05T10:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects transition firings with non-count effect values", () => {
    expect(() =>
      parseActualModeRecording({
        version: 1,
        exportedAt: "2026-06-05T10:01:00.000Z",
        title: "Replay",
        source: null,
        definition,
        initialState: { queued: 1, done: 0 },
        transitionFirings: [
          {
            transitionId: "finish",
            input: { queued: 1 },
            output: { done: [{}] },
            ts: "2026-06-05T10:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });

  it("reconstructs timeline markings from firing effects", () => {
    const reader = createActualModeTimelineFrameReader({
      definition: {
        ...definition,
        places: [
          ...definition.places,
          {
            id: "done",
            name: "Done",
            colorId: null,
            dynamicsEnabled: false,
            differentialEquationId: null,
            x: 100,
            y: 0,
          },
        ],
      },
      initialState: { queued: 2, done: 0 },
      transitionFirings: [
        {
          transitionId: "finish",
          input: { queued: 1 },
          output: { done: 1 },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringTimesMs: [0],
      point: {
        kind: "transition_firing",
        timeMs: 0,
        transitionFiringIndex: 0,
      },
      number: 1,
    });

    expect(reader.toFrameState().places).toEqual({
      queued: { tokenCount: 1 },
      done: { tokenCount: 1 },
    });
  });

  it.each([
    { marking: -1, expected: 0 },
    { marking: 2.9, expected: 2 },
  ])(
    "normalizes a numeric marking of $marking consistently",
    ({ marking, expected }) => {
      const reader = createActualModeTimelineFrameReader({
        definition,
        initialState: { queued: marking },
        transitionFirings: [],
        transitionFiringTimesMs: [],
        point: {
          kind: "initial",
          timeMs: 0,
          transitionFiringIndex: null,
        },
        number: 0,
      });

      expect(reader.getPlaceTokenCount("queued")).toBe(expected);
      expect(reader.toFrameState().places.queued?.tokenCount).toBe(expected);
      expect(reader.getRawView?.().placeCounts[0]).toBe(expected);
    },
  );

  it("replays keyed token values instead of dropping tokens FIFO", () => {
    const initialState = {
      queued: [{ ticket_id: "a" }, { ticket_id: "b" }, { ticket_id: "c" }],
      implementing: [],
    };
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      initialState,
      transitionFirings: [
        {
          transitionId: "start",
          input: { queued: 1 },
          output: { implementing: 1 },
          inputTokens: { queued: [{ ticket_id: "b" }] },
          outputTokens: { implementing: [{ ticket_id: "b" }] },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([{ ticket_id: "a" }, { ticket_id: "c" }]);
    expect(marking.implementing).toEqual([{ ticket_id: "b" }]);
  });

  it("falls back to FIFO when a recorded input token matches nothing", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      initialState: { queued: [{ ticket_id: "a" }, { ticket_id: "b" }] },
      transitionFirings: [
        {
          transitionId: "start",
          input: { queued: 1 },
          output: {},
          inputTokens: { queued: [{ ticket_id: "missing" }] },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([{ ticket_id: "b" }]);
  });

  it("exposes recorded token values through the frame reader", () => {
    const colouredDefinition = {
      ...definition,
      places: [
        {
          ...definition.places[0]!,
          id: "queued",
          name: "Queued",
          colorId: "ticket",
        },
      ],
      types: [
        {
          id: "ticket",
          name: "Ticket",
          iconSlug: "circle",
          displayColor: "#0000FF",
          elements: [
            { elementId: "ticket-id", name: "ticket_id", type: "string" },
            { elementId: "attempts", name: "attempts", type: "integer" },
          ],
        },
      ],
    } satisfies SDCPN;

    const reader = createActualModeTimelineFrameReader({
      definition: colouredDefinition,
      initialState: { queued: [] },
      transitionFirings: [
        {
          transitionId: "create",
          input: {},
          output: { queued: 1 },
          outputTokens: { queued: [{ ticket_id: "X-1234" }] },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringTimesMs: [0],
      point: {
        kind: "transition_firing",
        timeMs: 0,
        transitionFiringIndex: 0,
      },
      number: 1,
    });

    // Missing attributes resolve to type defaults on replay.
    expect(reader.getPlaceTokens(colouredDefinition.places[0]!)).toEqual([
      { ticket_id: "X-1234", attempts: 0 },
    ]);
  });

  it("keeps count-only coloured markings consistent for HIR metrics", () => {
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
      types: [
        {
          id: "item",
          name: "Item",
          iconSlug: "circle",
          displayColor: "#00FF00",
          elements: [
            {
              elementId: "value",
              name: "value",
              type: "real",
            },
          ],
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
    const reader = createActualModeTimelineFrameReader({
      definition: colouredDefinition,
      initialState: { items: 2.9 },
      transitionFirings: [],
      transitionFiringTimesMs: [],
      point: {
        kind: "initial",
        timeMs: 0,
        transitionFiringIndex: null,
      },
      number: 0,
    });
    const { artifacts, failures } = compileHirArtifacts(colouredDefinition);
    expect(failures).toEqual([]);
    const artifact = artifacts.metrics["item-count"];
    if (!artifact) {
      throw new Error("Expected the item-count HIR artifact");
    }
    const evaluate = createHirMetricEvaluator({
      metricName: "Item count",
      artifact,
      places: colouredDefinition.places,
    });

    const tokens = reader.getPlaceTokens(colouredDefinition.places[0]!);
    expect(reader.getPlaceTokenCount("items")).toBe(2);
    expect(tokens).toEqual([{ value: 0 }, { value: 0 }]);
    expect(evaluate(reader)).toBe(tokens.length);
  });
});
