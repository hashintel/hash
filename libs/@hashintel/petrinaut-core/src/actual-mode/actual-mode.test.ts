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

import type { Color, ColorElementType, Place, SDCPN } from "../types/sdcpn";
import type { ActualModeMarking, ActualModeTransitionFiring } from "./types";

const makePlace = (id: string, colorId: string | null = null): Place => ({
  id,
  name: id.charAt(0).toUpperCase() + id.slice(1),
  colorId,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const definition: SDCPN = {
  places: [makePlace("queued"), makePlace("done")],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const ticketColour: Color = {
  id: "ticket",
  name: "Ticket",
  iconSlug: "circle",
  displayColor: "#0000FF",
  elements: [
    { elementId: "ticket-id", name: "ticket_id", type: "string" },
    { elementId: "attempts", name: "attempts", type: "integer" },
  ],
};

const ticketDefinition: SDCPN = {
  ...definition,
  places: [
    makePlace("queued", "ticket"),
    makePlace("implementing", "ticket"),
    makePlace("log"),
  ],
  types: [ticketColour],
};

const ticket = (ticketId: string, attempts = 0) => ({
  ticket_id: ticketId,
  attempts,
});

const firingAt = (
  transitionId: string,
  inputTokens: ActualModeTransitionFiring["inputTokens"],
  outputTokens: ActualModeTransitionFiring["outputTokens"],
): ActualModeTransitionFiring => ({
  transitionId,
  inputTokens,
  outputTokens,
  ts: "2026-06-05T10:00:00.000Z",
});

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
      definition: ticketDefinition,
      initialState: { queued: [] },
      transitionFirings: [
        firingAt("create", {}, { queued: [ticket("a")] }),
        firingAt(
          "start",
          { queued: [ticket("a")] },
          { implementing: [ticket("a", 1)] },
        ),
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(parseActualModeRecording(recording)).toEqual(recording);
  });

  it("rejects a recording whose firing consumes a token the marking does not hold", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: null,
      definition: ticketDefinition,
      initialState: { queued: [ticket("b")] },
      transitionFirings: [firingAt("start", { queued: [ticket("a")] }, {})],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(() => parseActualModeRecording(recording)).toThrow(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            path: ["transitionFirings", 0],
            message:
              'Transition firing of "start" at 2026-06-05T10:00:00.000Z consumes token {"ticket_id":"a","attempts":0} from place "queued", which holds no matching token (1 remaining)',
          }),
        ],
      }),
    );
  });

  it("rejects a recording whose initial state holds an incomplete token record", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: null,
      definition: ticketDefinition,
      initialState: { queued: [{ ticket_id: "a" }] },
      transitionFirings: [],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(() => parseActualModeRecording(recording)).toThrow(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            path: ["initialState"],
            message:
              'Initial marking holds token {"ticket_id":"a"} in place "queued", which lacks element "attempts" of colour "Ticket"',
          }),
        ],
      }),
    );
  });

  it("rejects a recording whose firing produces an incomplete token record", () => {
    const recording = createActualModeRecording({
      title: "Replay",
      source: null,
      definition: ticketDefinition,
      initialState: { queued: [] },
      transitionFirings: [
        firingAt("create", {}, { queued: [ticket("a")] }),
        firingAt("create", {}, { queued: [{ ticket_id: "b" }] }),
      ],
      exportedAt: "2026-06-05T10:01:00.000Z",
    });

    expect(() => parseActualModeRecording(recording)).toThrow(
      expect.objectContaining({
        issues: [
          expect.objectContaining({
            path: ["transitionFirings", 1],
            message:
              'Transition firing of "create" at 2026-06-05T10:00:00.000Z produces token {"ticket_id":"b"} in place "queued", which lacks element "attempts" of colour "Ticket"',
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
      definition,
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
      definition,
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

  it("removes the marking token equal to the recorded input token", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      definition: ticketDefinition,
      initialState: {
        queued: [ticket("a"), ticket("b"), ticket("c")],
        implementing: [],
      },
      transitionFirings: [
        firingAt(
          "start",
          { queued: [ticket("b")] },
          { implementing: [ticket("b")] },
        ),
      ],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([ticket("a"), ticket("c")]);
    expect(marking.implementing).toEqual([ticket("b")]);
  });

  it("removes the first of several equal marking tokens", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      definition: ticketDefinition,
      initialState: { queued: [ticket("a"), ticket("b"), ticket("a")] },
      transitionFirings: [firingAt("start", { queued: [ticket("a")] }, {})],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([ticket("b"), ticket("a")]);
  });

  it("throws for a recorded input token that differs from every marking token on one attribute", () => {
    expect(() =>
      getActualModeMarkingAtTransitionFiringIndex({
        definition: ticketDefinition,
        initialState: { queued: [ticket("a"), ticket("b")] },
        transitionFirings: [
          firingAt("start", { queued: [ticket("a", 1)] }, {}),
        ],
        transitionFiringIndex: 0,
      }),
    ).toThrow(
      'Transition firing of "start" at 2026-06-05T10:00:00.000Z consumes token {"ticket_id":"a","attempts":1} from place "queued", which holds no matching token (2 remaining)',
    );
  });

  it("throws for a record consumed twice from a place that holds it once", () => {
    expect(() =>
      applyActualModeTransitionFiring(
        ticketDefinition,
        { queued: [ticket("a")] },
        firingAt("start", { queued: [ticket("a"), ticket("a")] }, {}),
      ),
    ).toThrow(
      /consumes token \{"ticket_id":"a","attempts":0\} from place "queued".*\(0 remaining\)/,
    );
  });

  it.each<{ initialState: ActualModeMarking; holds: number }>([
    { initialState: { queued: 1 }, holds: 1 },
    { initialState: {}, holds: 0 },
  ])(
    "throws for a firing that consumes more tokens than a count place holds ($holds)",
    ({ initialState, holds }) => {
      expect(() =>
        applyActualModeTransitionFiring(definition, initialState, {
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

  it("appends produced tokens as recorded", () => {
    const marking = getActualModeMarkingAtTransitionFiringIndex({
      definition: ticketDefinition,
      initialState: { queued: [] },
      transitionFirings: [
        firingAt("create", {}, { queued: [ticket("a"), ticket("b")] }),
      ],
      transitionFiringIndex: 0,
    });

    expect(marking.queued).toEqual([ticket("a"), ticket("b")]);
  });

  it("exposes recorded token values through the frame reader", () => {
    const reader = createActualModeTimelineFrameReader({
      definition: ticketDefinition,
      initialState: { queued: [] },
      transitionFirings: [
        firingAt("create", {}, { queued: [ticket("X-1234", 2)] }),
      ],
      transitionFiringTimesMs: [0],
      point: {
        kind: "transition_firing",
        timeMs: 0,
        transitionFiringIndex: 0,
      },
      number: 1,
    });

    expect(reader.getPlaceTokens(ticketDefinition.places[0]!)).toEqual([
      ticket("X-1234", 2),
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

describe("Actual mode token record validation", () => {
  const sampleColour: Color = {
    id: "sample",
    name: "Sample",
    iconSlug: "circle",
    displayColor: "#FF0000",
    elements: (
      [
        ["weight", "real"],
        ["count", "integer"],
        ["checked", "boolean"],
        ["sample_id", "uuid"],
        ["label", "string"],
      ] as const
    ).map(([name, type]) => ({ elementId: name, name, type })),
  };
  const sampleDefinition: SDCPN = {
    ...definition,
    places: [makePlace("samples", "sample"), makePlace("queued")],
    types: [sampleColour],
  };
  const sample = {
    weight: 1.5,
    count: 2,
    checked: true,
    sample_id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    label: "first",
  };
  const produceSample = (record: Record<string, number | boolean | string>) =>
    applyActualModeTransitionFiring(
      sampleDefinition,
      { samples: [] },
      firingAt("take", {}, { samples: [record] }),
    );

  it("accepts a record that carries every element with a value of its type", () => {
    expect(produceSample(sample).samples).toEqual([sample]);
  });

  it("rejects a record that lacks an element", () => {
    const { label: _label, ...withoutLabel } = sample;

    expect(() => produceSample(withoutLabel)).toThrow(
      `Transition firing of "take" at 2026-06-05T10:00:00.000Z produces token ${JSON.stringify(withoutLabel)} in place "samples", which lacks element "label" of colour "Sample"`,
    );
  });

  it("rejects a record with an attribute the colour does not declare", () => {
    const withExtra = { ...sample, colour: "red" };

    expect(() => produceSample(withExtra)).toThrow(
      `Transition firing of "take" at 2026-06-05T10:00:00.000Z produces token ${JSON.stringify(withExtra)} in place "samples", which carries attribute "colour" that colour "Sample" does not declare`,
    );
  });

  it.each<{
    name: string;
    type: ColorElementType;
    value: number | boolean | string;
    expected: string;
  }>([
    { name: "weight", type: "real", value: "1.5", expected: "a finite number" },
    { name: "count", type: "integer", value: 2.5, expected: "an integer" },
    { name: "checked", type: "boolean", value: 1, expected: "a boolean" },
    {
      name: "sample_id",
      type: "uuid",
      value: "0F8FAD5B-D9CB-469F-A165-70867728950E",
      expected: "a canonical lowercase UUID string",
    },
    { name: "label", type: "string", value: 7, expected: "a string" },
  ])("rejects a $type element holding $value", ({ name, value, expected }) => {
    expect(() => produceSample({ ...sample, [name]: value })).toThrow(
      `whose element "${name}" of colour "Sample" is ${JSON.stringify(value)}, not ${expected}`,
    );
  });

  it("rejects a non-empty record for an uncoloured place", () => {
    expect(() =>
      applyActualModeTransitionFiring(
        sampleDefinition,
        { queued: 1 },
        firingAt("start", { queued: [{ ticket_id: "a" }] }, {}),
      ),
    ).toThrow(
      'Transition firing of "start" at 2026-06-05T10:00:00.000Z consumes token {"ticket_id":"a"} from place "queued", which carries attribute "ticket_id" although the place has no colour',
    );
  });

  it("rejects a firing that names a place the net does not define", () => {
    expect(() =>
      applyActualModeTransitionFiring(
        sampleDefinition,
        {},
        firingAt("start", {}, { archived: [{}] }),
      ),
    ).toThrow(
      'Transition firing of "start" at 2026-06-05T10:00:00.000Z names place "archived", which the net does not define',
    );
  });

  it("checks a scoped place against the subnet colour", () => {
    const scopedDefinition: SDCPN = {
      ...definition,
      subnets: [
        {
          id: "worker",
          name: "Worker",
          places: [makePlace("inbox", "ticket")],
          transitions: [],
          types: [ticketColour],
          differentialEquations: [],
          parameters: [],
        },
      ],
      componentInstances: [
        {
          id: "worker-1",
          name: "WorkerOne",
          subnetId: "worker",
          parameterValues: {},
          x: 0,
          y: 0,
        },
      ],
    };

    expect(
      applyActualModeTransitionFiring(
        scopedDefinition,
        {},
        firingAt("assign", {}, { "worker-1::inbox": [ticket("a")] }),
      ),
    ).toEqual({ "worker-1::inbox": [ticket("a")] });
    expect(() =>
      applyActualModeTransitionFiring(
        scopedDefinition,
        {},
        firingAt("assign", {}, { "worker-1::inbox": [{}] }),
      ),
    ).toThrow('which lacks element "ticket_id" of colour "Ticket"');
  });
});
