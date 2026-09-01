import { describe, expect, it } from "vitest";

import {
  createActualModeTimelineFrameReader,
  getActualModeTransitionFiringTimesMs,
} from "../actual-mode";
import { compileHirArtifacts } from "../hir/compile";
import { createStatusViewFrameEvaluator } from "./frames/hir-status-view";
import {
  createStatusViewTracker,
  summarizeStatusIntervals,
} from "./status-views";

import type { ActualModeTransitionFiring } from "../actual-mode";
import type {
  Color,
  Place,
  SDCPN,
  StatusView,
  TokenRecord,
} from "../types/sdcpn";
import type { SimulationFrameReader } from "./api";

const ticketColor: Color = {
  id: "type-ticket",
  name: "Ticket",
  iconSlug: "circle",
  displayColor: "#0000FF",
  elements: [
    {
      elementId: "ticket-id",
      name: "ticket_id",
      type: "string",
      identityRef: "identity-ticket",
    },
    { elementId: "attempts", name: "attempts", type: "integer" },
  ],
};

const makePlace = (id: string, name: string): Place => ({
  id,
  name,
  colorId: "type-ticket",
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
});

const places: Place[] = [
  makePlace("todo", "Todo"),
  makePlace("doing", "Doing"),
  makePlace("done", "Done"),
];

const statusView: StatusView = {
  id: "view-1",
  name: "Ticket status",
  identityRef: "identity-ticket",
  labels: [
    {
      id: "label-retrying",
      name: "Retrying",
      displayColor: "#f59e0b",
      places: ["doing"],
      tokenCondition: "token.attempts > 0",
    },
    {
      id: "label-doing",
      name: "Doing",
      displayColor: "#2563eb",
      places: ["doing"],
    },
    {
      id: "label-todo",
      name: "Todo",
      displayColor: "#94a3b8",
      places: ["todo"],
    },
    {
      id: "label-done",
      name: "Done",
      displayColor: "#16a34a",
      places: ["done"],
    },
    {
      id: "label-gone",
      name: "Gone",
      displayColor: "#64748b",
      places: [],
      isExit: true,
    },
  ],
};

const sdcpnWithView: SDCPN = {
  places,
  transitions: [],
  types: [ticketColor],
  differentialEquations: [],
  parameters: [],
  identities: [
    { id: "identity-ticket", name: "Ticket", keyElementTypes: ["string"] },
  ],
  statusViews: [statusView],
};

const makeFrame = (
  number: number,
  timeSeconds: number,
  tokensByPlaceId: Record<string, TokenRecord[]>,
): SimulationFrameReader => ({
  number,
  time: timeSeconds,
  getPlaceTokenCount: (placeId) => tokensByPlaceId[placeId]?.length ?? 0,
  getPlaceTokens: (place) => tokensByPlaceId[place.id] ?? [],
  getTransitionState: () => null,
  toFrameState: () => ({ number, places: {} }),
});

const compileStatusConditions = () => {
  const { artifacts, failures } = compileHirArtifacts(sdcpnWithView);
  expect(failures).toEqual([]);
  return artifacts.statusConditions;
};

describe("status view derivation", () => {
  it("compiles label token conditions and reports bad ones", () => {
    const statusConditions = compileStatusConditions();
    expect(Object.keys(statusConditions)).toHaveLength(1);

    const broken = compileHirArtifacts({
      ...sdcpnWithView,
      statusViews: [
        {
          ...statusView,
          labels: [
            {
              ...statusView.labels[0]!,
              tokenCondition: "token.attempts +",
            },
          ],
        },
      ],
    });
    expect(broken.failures).toHaveLength(1);
    expect(broken.failures[0]).toMatchObject({
      itemId: "label-retrying",
      itemType: "status-label-condition",
    });
  });

  it("assigns labels by array order with token conditions deciding ties", () => {
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
    });

    const assignments = evaluate(
      makeFrame(0, 0, {
        todo: [{ ticket_id: "a", attempts: 0 }],
        doing: [
          { ticket_id: "b", attempts: 0 },
          { ticket_id: "c", attempts: 2 },
        ],
      }),
    );

    expect(assignments.get("a")).toEqual({
      labelId: "label-todo",
      keyValues: ["a"],
      placeId: "todo",
    });
    expect(assignments.get("b")).toEqual({
      labelId: "label-doing",
      keyValues: ["b"],
      placeId: "doing",
    });
    expect(assignments.get("c")).toEqual({
      labelId: "label-retrying",
      keyValues: ["c"],
      placeId: "doing",
    });
  });

  it("tracks multi-interval dwell across enter/leave/re-enter loops", () => {
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
    });
    const tracker = createStatusViewTracker({
      statusView,
      evaluateFrame: evaluate,
    });

    const ticket = (attempts: number): TokenRecord => ({
      ticket_id: "a",
      attempts,
    });
    tracker.observeFrame(makeFrame(0, 0, { todo: [ticket(0)] }));
    tracker.observeFrame(makeFrame(1, 1, { doing: [ticket(0)] }));
    tracker.observeFrame(makeFrame(2, 3, { todo: [ticket(1)] }));
    tracker.observeFrame(makeFrame(3, 4, { doing: [ticket(1)] }));
    tracker.observeFrame(makeFrame(4, 6, { done: [ticket(1)] }));

    const [instance] = tracker.getInstanceStatuses();
    expect(instance).toBeDefined();
    expect(instance!.currentLabelId).toBe("label-done");
    expect(instance!.keyValues).toEqual(["a"]);

    const nowMs = tracker.lastObservedTimeMs();
    expect(
      summarizeStatusIntervals(instance!.intervals, "label-todo", nowMs),
    ).toEqual({ totalMs: 2_000, entryCount: 2 });
    expect(
      summarizeStatusIntervals(instance!.intervals, "label-doing", nowMs),
    ).toEqual({ totalMs: 2_000, entryCount: 1 });
    expect(
      summarizeStatusIntervals(instance!.intervals, "label-retrying", nowMs),
    ).toEqual({ totalMs: 2_000, entryCount: 1 });
    expect(
      summarizeStatusIntervals(instance!.intervals, "label-done", nowMs),
    ).toEqual({ totalMs: 0, entryCount: 1 });
  });

  it("falls back to the exit label when an instance's token leaves the view", () => {
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
    });
    const tracker = createStatusViewTracker({
      statusView,
      evaluateFrame: evaluate,
    });

    tracker.observeFrame(
      makeFrame(0, 0, { done: [{ ticket_id: "a", attempts: 0 }] }),
    );
    tracker.observeFrame(makeFrame(1, 2, {}));

    const [instance] = tracker.getInstanceStatuses();
    expect(instance!.currentLabelId).toBe("label-gone");
    expect(instance!.intervals).toEqual([
      { labelId: "label-done", fromMs: 0, toMs: 2_000 },
      { labelId: "label-gone", fromMs: 2_000, toMs: null },
    ]);
  });

  it("derives status from actual-mode frames carrying token values", () => {
    const transitionFirings: ActualModeTransitionFiring[] = [
      {
        transitionId: "start",
        input: { todo: 1 },
        output: { doing: 1 },
        inputTokens: { todo: [{ ticket_id: "a" }] },
        outputTokens: { doing: [{ ticket_id: "a", attempts: 0 }] },
        ts: "2026-06-05T10:00:00.000Z",
      },
      {
        transitionId: "finish",
        input: { doing: 1 },
        output: { done: 1 },
        inputTokens: { doing: [{ ticket_id: "a" }] },
        outputTokens: { done: [{ ticket_id: "a", attempts: 0 }] },
        ts: "2026-06-05T10:00:05.000Z",
      },
    ];
    const definition = {
      places,
      transitions: [],
      types: [ticketColor],
    };
    const initialState = { todo: [{ ticket_id: "a", attempts: 0 }] };
    const transitionFiringTimesMs = getActualModeTransitionFiringTimesMs(
      transitionFirings,
      null,
      null,
    );

    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
    });
    const tracker = createStatusViewTracker({
      statusView,
      evaluateFrame: evaluate,
    });

    tracker.observeFrame(
      createActualModeTimelineFrameReader({
        definition,
        initialState,
        transitionFirings,
        transitionFiringTimesMs,
        point: { kind: "initial", timeMs: 0, transitionFiringIndex: null },
        number: 0,
      }),
    );
    for (const [index, timeMs] of transitionFiringTimesMs.entries()) {
      tracker.observeFrame(
        createActualModeTimelineFrameReader({
          definition,
          initialState,
          transitionFirings,
          transitionFiringTimesMs,
          point: {
            kind: "transition_firing",
            timeMs,
            transitionFiringIndex: index,
          },
          number: index + 1,
        }),
      );
    }

    const [instance] = tracker.getInstanceStatuses();
    expect(instance!.currentLabelId).toBe("label-done");
    expect(instance!.intervals.map((interval) => interval.labelId)).toEqual([
      "label-todo",
      "label-doing",
      "label-done",
    ]);
    expect(instance!.intervals[1]).toEqual({
      labelId: "label-doing",
      fromMs: 0,
      toMs: 5_000,
    });
  });
});
