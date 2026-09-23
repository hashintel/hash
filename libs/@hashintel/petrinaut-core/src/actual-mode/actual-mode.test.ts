import { describe, expect, it } from "vitest";

import {
  actualModeTransitionFiringSchema,
  applyActualModeTransitionFiring,
  createActualModeFrameReplay,
  createActualModeReceivedEventsRecording,
  createActualModeRecording,
  createActualModeTimelineFrameReader,
  extendActualModeTransitionFiringTimesMs,
  getActualModeMarkingAtTransitionFiringIndex,
  getActualModeTransitionFiringTimesMs,
  parseActualModeRecording,
  retimeActualModeRecordingForReplay,
} from ".";
import { compileHirArtifacts } from "../hir/compile";
import { createHirMetricEvaluator } from "../simulation/frames/hir-metric";

import type { SDCPN } from "../types/sdcpn";
import type { ActualModeMarking } from "./types";

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
          inputTokens: { queued: [{}] },
          outputTokens: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(recording.version).toBe(2);
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
      initialState: { queued: 0 },
      transitionFirings: [
        {
          transitionId: "create",
          inputTokens: {},
          outputTokens: { queued: [{ ticket_id: "a" }] },
          ts: "2026-06-05T10:00:00.000Z",
        },
        {
          transitionId: "start",
          inputTokens: { queued: [{ ticket_id: "a" }] },
          outputTokens: { implementing: [{ ticket_id: "a", attempts: 1 }] },
          ts: "2026-06-05T10:00:01.000Z",
        },
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(parseActualModeRecording(recording)).toEqual(recording);
  });

  it("rejects a recording whose firing consumes a token the marking does not hold", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: null,
      definition,
      initialState: { queued: 1 },
      transitionFirings: [
        {
          transitionId: "start",
          inputTokens: { queued: [{ ticket_id: "a" }] },
          outputTokens: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(() => parseActualModeRecording(recording)).toThrow(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            path: ["transitionFirings", 0],
            message:
              'Transition firing of "start" at 2026-06-05T10:00:00.000Z consumes token {"ticket_id":"a"} from place "queued", which holds no matching token (1 remaining)',
          }),
        ],
      }),
    );
  });

  it.each([1, 3])("rejects recording version %i", (version) => {
    expect(() =>
      parseActualModeRecording({
        version,
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
          inputTokens: { queued: [{}] },
          outputTokens: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
        {
          transitionId: "second",
          inputTokens: { queued: [{}] },
          outputTokens: {},
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
        version: 2,
        exportedAt: "2026-06-05T10:01:00.000Z",
        title: "Replay",
        source: null,
        definition,
        initialState: { queued: 1, done: 0 },
        transitionFirings: [
          {
            transitionId: "finish",
            inputTokens: { queued: [{}] },
            outputTokens: { done: [{}] },
            unsupported: { done: 1 },
            ts: "2026-06-05T10:00:00.000Z",
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects transition firings that name no consumed or produced tokens", () => {
    const missingOutput = actualModeTransitionFiringSchema.safeParse({
      transitionId: "start",
      inputTokens: { queued: [{}] },
      ts: "2026-06-05T10:00:00.000Z",
    });
    const missingInput = actualModeTransitionFiringSchema.safeParse({
      transitionId: "start",
      outputTokens: { done: [{}] },
      ts: "2026-06-05T10:00:00.000Z",
    });

    expect(missingOutput.error?.issues.map((issue) => issue.path)).toEqual([
      ["outputTokens"],
    ]);
    expect(missingInput.error?.issues.map((issue) => issue.path)).toEqual([
      ["inputTokens"],
    ]);
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
          inputTokens: { queued: [{}] },
          outputTokens: { done: [{}] },
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

  it("extends known firing times without recomputing them", () => {
    const firings = [
      {
        transitionId: "a",
        inputTokens: {},
        outputTokens: {},
        ts: "2026-06-05T10:00:00.000Z",
      },
      {
        transitionId: "b",
        inputTokens: {},
        outputTokens: {},
        ts: "2026-06-05T10:00:02.000Z",
      },
      {
        transitionId: "c",
        inputTokens: {},
        outputTokens: {},
        ts: "not a timestamp",
      },
    ];
    const firstTwo = getActualModeTransitionFiringTimesMs(
      firings.slice(0, 2),
      null,
      null,
    );

    expect(firstTwo).toEqual([0, 2_000]);
    expect(
      extendActualModeTransitionFiringTimesMs(firstTwo, firings, null, null),
    ).toEqual(getActualModeTransitionFiringTimesMs(firings, null, null));
    expect(
      extendActualModeTransitionFiringTimesMs(firstTwo, firings, null, null),
    ).toEqual([0, 2_000, 2_001]);
  });

  it("replays firings once across points and restarts on an earlier point", () => {
    const transitionFirings = [
      {
        transitionId: "finish",
        inputTokens: { queued: [{}] },
        outputTokens: { done: [{}] },
        ts: "2026-06-05T10:00:00.000Z",
      },
      {
        transitionId: "finish",
        inputTokens: { queued: [{}] },
        outputTokens: { done: [{}] },
        ts: "2026-06-05T10:00:01.000Z",
      },
    ];
    const replay = createActualModeFrameReplay({
      definition,
      initialState: { queued: 2, done: 0 },
    });
    const readerAt = (transitionFiringIndex: number | null) =>
      replay.readerAt({
        transitionFirings,
        transitionFiringTimesMs: [0, 1_000],
        point: {
          kind:
            transitionFiringIndex === null ? "initial" : "transition_firing",
          timeMs: 0,
          transitionFiringIndex,
        },
        number: 0,
      });

    expect(readerAt(null).getPlaceTokenCount("queued")).toBe(2);
    expect(readerAt(1).getPlaceTokenCount("queued")).toBe(0);
    expect(readerAt(1).getPlaceTokenCount("done")).toBe(2);
    expect(readerAt(0).getPlaceTokenCount("queued")).toBe(1);
  });

  it("keeps a place numeric while every token recorded for it is attribute-less", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      initialState: { queued: 2 },
      transitionFirings: [
        {
          transitionId: "finish",
          inputTokens: { queued: [{}] },
          outputTokens: { done: [{}, {}] },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringIndex: 0,
    });

    expect(marking).toEqual({ queued: 1, done: 2 });
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

  it("removes the marking token whose key matches the recorded input token", () => {
    const initialState = {
      queued: [{ ticket_id: "a" }, { ticket_id: "b" }, { ticket_id: "c" }],
      implementing: [],
    };
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      initialState,
      transitionFirings: [
        {
          transitionId: "start",
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

  it("throws for a recorded input token that matches no marking token", () => {
    expect(() =>
      getActualModeMarkingAtTransitionFiringIndex({
        initialState: { queued: [{ ticket_id: "a" }, { ticket_id: "b" }] },
        transitionFirings: [
          {
            transitionId: "start",
            inputTokens: { queued: [{ ticket_id: "missing" }] },
            outputTokens: {},
            ts: "2026-06-05T10:00:00.000Z",
          },
        ],
        transitionFiringIndex: 0,
      }),
    ).toThrow(
      'Transition firing of "start" at 2026-06-05T10:00:00.000Z consumes token {"ticket_id":"missing"} from place "queued", which holds no matching token (2 remaining)',
    );
  });

  it("throws for an attribute-less record consumed from an empty token array", () => {
    expect(() =>
      applyActualModeTransitionFiring(
        { queued: [{ ticket_id: "a" }] },
        {
          transitionId: "start",
          inputTokens: { queued: [{ ticket_id: "a" }, {}] },
          outputTokens: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
      ),
    ).toThrow(/consumes token \{\} from place "queued".*\(0 remaining\)/);
  });

  it.each<{ initialState: ActualModeMarking; holds: number }>([
    { initialState: { queued: 1 }, holds: 1 },
    { initialState: {}, holds: 0 },
  ])(
    "throws for a firing that consumes more tokens than a count place holds ($holds)",
    ({ initialState, holds }) => {
      expect(() =>
        applyActualModeTransitionFiring(initialState, {
          transitionId: "finish",
          inputTokens: { queued: [{}, {}] },
          outputTokens: { done: [{}] },
          ts: "2026-06-05T10:00:00.000Z",
        }),
      ).toThrow(
        `Transition firing of "finish" at 2026-06-05T10:00:00.000Z consumes 2 tokens from place "queued", which holds ${holds}`,
      );
    },
  );

  it("throws from the frame replay when a firing does not match the marking", () => {
    const replay = createActualModeFrameReplay({
      definition,
      initialState: { queued: 0 },
    });

    expect(() =>
      replay.readerAt({
        transitionFirings: [
          {
            transitionId: "finish",
            inputTokens: { queued: [{}] },
            outputTokens: {},
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
      }),
    ).toThrow(/consumes 1 token from place "queued", which holds 0/);
  });

  it("removes the oldest token for an attribute-less record", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      initialState: {
        queued: [{ ticket_id: "a" }, { ticket_id: "b" }, { ticket_id: "c" }],
      },
      transitionFirings: [
        {
          transitionId: "start",
          inputTokens: { queued: [{ ticket_id: "b" }, {}] },
          outputTokens: {},
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([{ ticket_id: "c" }]);
  });

  it("appends produced tokens as recorded", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      initialState: { queued: [] },
      transitionFirings: [
        {
          transitionId: "create",
          inputTokens: {},
          outputTokens: { queued: [{ ticket_id: "a" }, {}] },
          ts: "2026-06-05T10:00:00.000Z",
        },
      ],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([{ ticket_id: "a" }, {}]);
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
          inputTokens: {},
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
