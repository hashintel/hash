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

  it("collapses tokens sharing one identity key into a single assignment", () => {
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
    });

    const samePlace = evaluate(
      makeFrame(0, 0, {
        doing: [
          { ticket_id: "a", attempts: 0 },
          { ticket_id: "a", attempts: 2 },
        ],
      }),
    );
    expect([...samePlace.keys()]).toEqual(["a"]);
    expect(samePlace.get("a")?.labelId).toBe("label-retrying");

    const acrossLabels = evaluate(
      makeFrame(0, 0, {
        todo: [{ ticket_id: "a", attempts: 0 }],
        done: [{ ticket_id: "a", attempts: 0 }],
      }),
    );
    expect([...acrossLabels.keys()]).toEqual(["a"]);
    expect(acrossLabels.get("a")?.labelId, "label array order decides").toBe(
      "label-todo",
    );
  });

  it("skips tokens with missing or unset key values and colours without key elements", () => {
    const noteColor: Color = {
      id: "type-note",
      name: "Note",
      iconSlug: "circle",
      displayColor: "#00FF00",
      elements: [{ elementId: "note-text", name: "text", type: "string" }],
    };
    const notesPlace: Place = {
      ...makePlace("notes", "Notes"),
      colorId: "type-note",
    };
    const viewWithNotes: StatusView = {
      ...statusView,
      labels: [
        ...statusView.labels.slice(0, 4),
        {
          id: "label-notes",
          name: "Notes",
          displayColor: "#0ea5e9",
          places: ["notes"],
        },
      ],
    };
    const evaluate = createStatusViewFrameEvaluator({
      statusView: viewWithNotes,
      places: [...places, notesPlace],
      types: [ticketColor, noteColor],
      statusConditions: compileStatusConditions(),
    });

    const assignments = evaluate(
      makeFrame(0, 0, {
        // Missing key attribute, and empty-string (type default) key: both
        // untracked rather than merged into a phantom "" instance.
        todo: [{ attempts: 0 }, { ticket_id: "", attempts: 0 }],
        // The Note colour carries no key element for the ticket identity.
        notes: [{ text: "unkeyed" }],
      }),
    );

    expect(assignments.size).toBe(0);
  });

  it("tracks one instance across colours and scopes conditions to colours carrying the read attributes", () => {
    const machineColor: Color = {
      id: "type-machine",
      name: "Machine",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [
        {
          elementId: "machine-id",
          name: "machine_id",
          type: "string",
          identityRef: "identity-machine",
        },
        { elementId: "damage", name: "damage", type: "real" },
      ],
    };
    const producingColor: Color = {
      id: "type-producing",
      name: "MachineProducing",
      iconSlug: "circle",
      displayColor: "#AA0000",
      elements: [
        {
          elementId: "producing-machine-id",
          name: "machine_id",
          type: "string",
          identityRef: "identity-machine",
        },
      ],
    };
    const machinePlaces: Place[] = [
      { ...makePlace("idle", "Idle"), colorId: "type-machine" },
      { ...makePlace("producing", "Producing"), colorId: "type-producing" },
    ];
    const machineView: StatusView = {
      id: "view-machines",
      name: "Machine status",
      identityRef: "identity-machine",
      labels: [
        {
          id: "label-worn",
          name: "Worn",
          displayColor: "#f97316",
          places: ["idle", "producing"],
          tokenCondition: "token.damage > 0.5",
        },
        {
          id: "label-active",
          name: "Active",
          displayColor: "#22c55e",
          places: ["idle", "producing"],
        },
      ],
    };
    const machineSdcpn: SDCPN = {
      places: machinePlaces,
      transitions: [],
      types: [machineColor, producingColor],
      differentialEquations: [],
      parameters: [],
      identities: [
        {
          id: "identity-machine",
          name: "Machine",
          keyElementTypes: ["string"],
        },
      ],
      statusViews: [machineView],
    };
    const { artifacts, failures } = compileHirArtifacts(machineSdcpn);
    expect(failures).toEqual([]);

    const conditionErrors: unknown[] = [];
    const evaluate = createStatusViewFrameEvaluator({
      statusView: machineView,
      places: machinePlaces,
      types: [machineColor, producingColor],
      statusConditions: artifacts.statusConditions,
      onConditionError: (error) => conditionErrors.push(error),
    });
    const tracker = createStatusViewTracker({
      statusView: machineView,
      evaluateFrame: evaluate,
    });

    tracker.observeFrame(
      makeFrame(0, 0, { idle: [{ machine_id: "m1", damage: 0.9 }] }),
    );
    // The MachineProducing colour has no `damage`: the Worn condition never
    // matches its tokens, without evaluation errors, so the instance falls
    // to Active — while its key stays the same across the colour change.
    tracker.observeFrame(
      makeFrame(1, 2, { producing: [{ machine_id: "m1" }] }),
    );

    const statuses = tracker.getInstanceStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0]!.keyValues).toEqual(["m1"]);
    expect(statuses[0]!.intervals.map((interval) => interval.labelId)).toEqual([
      "label-worn",
      "label-active",
    ]);
    expect(conditionErrors).toEqual([]);
  });

  it("matches nothing for a declared condition without a compiled artifact", () => {
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: {},
    });

    const assignments = evaluate(
      makeFrame(0, 0, { doing: [{ ticket_id: "a", attempts: 5 }] }),
    );

    expect(
      assignments.get("a")?.labelId,
      "fails closed to the next label",
    ).toBe("label-doing");
  });

  it("reports condition evaluation failures instead of swallowing them", () => {
    const conditionErrors: { labelId: string; message: string }[] = [];
    const evaluate = createStatusViewFrameEvaluator({
      statusView,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
      onConditionError: (error) =>
        conditionErrors.push({
          labelId: error.labelId,
          message: error.message,
        }),
    });

    // The colour declares `attempts`, so the read is statically satisfiable,
    // but this hand-built frame's token record does not carry it: the
    // interpreter failure is surfaced and the token falls to the next label.
    const assignments = evaluate(
      makeFrame(0, 0, { doing: [{ ticket_id: "a" }] }),
    );

    expect(assignments.get("a")?.labelId).toBe("label-doing");
    expect(conditionErrors).toHaveLength(1);
    expect(conditionErrors[0]!.labelId).toBe("label-retrying");
  });

  it("closes the open interval without a new one when no exit label exists", () => {
    const viewWithoutExit: StatusView = {
      ...statusView,
      labels: statusView.labels.filter((label) => !label.isExit),
    };
    const evaluate = createStatusViewFrameEvaluator({
      statusView: viewWithoutExit,
      places,
      types: [ticketColor],
      statusConditions: compileStatusConditions(),
    });
    const tracker = createStatusViewTracker({
      statusView: viewWithoutExit,
      evaluateFrame: evaluate,
    });

    const ticket = { ticket_id: "a", attempts: 0 };
    tracker.observeFrame(makeFrame(0, 0, { todo: [ticket] }));
    tracker.observeFrame(makeFrame(1, 2, {}));

    const [afterExit] = tracker.getInstanceStatuses();
    expect(afterExit!.currentLabelId).toBeNull();
    expect(afterExit!.intervals).toEqual([
      { labelId: "label-todo", fromMs: 0, toMs: 2_000 },
    ]);

    tracker.observeFrame(makeFrame(2, 5, { doing: [ticket] }));

    const [afterReentry] = tracker.getInstanceStatuses();
    expect(afterReentry!.currentLabelId).toBe("label-doing");
    expect(afterReentry!.intervals).toEqual([
      { labelId: "label-todo", fromMs: 0, toMs: 2_000 },
      { labelId: "label-doing", fromMs: 5_000, toMs: null },
    ]);
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
