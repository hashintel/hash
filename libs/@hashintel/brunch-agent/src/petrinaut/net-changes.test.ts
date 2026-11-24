import { describe, expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";

import {
  callsForElement,
  isAppliedChange,
  latestNetDefinition,
  netResultView,
  type NetCallCore,
} from "./net-changes";

/** A settled call, with the revisions its metadata reports. */
const call = (
  toolCallId: string,
  toolName: string,
  input: unknown,
  output: unknown,
  metadata: {
    documentRevision?: { before: string; after?: string };
    readBack?: unknown;
  },
): NetCallCore => ({
  toolCallId,
  toolName,
  input,
  output,
  revisionBefore: metadata.documentRevision?.before,
  revisionAfter: metadata.documentRevision?.after,
  metadata,
});

const applied = (toolCallId: string, toolName: string, input: unknown) =>
  call(
    toolCallId,
    toolName,
    input,
    { applied: true },
    {
      documentRevision: { before: `${toolCallId}-0`, after: `${toolCallId}-1` },
    },
  );

const queue = {
  id: "queue",
  name: "Queue",
  colorId: null,
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};
const definition = {
  places: [queue],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
};

describe("callsForElement", () => {
  const calls = [
    applied("arc-kind", "updateArcType", {
      transitionId: "serve",
      placeId: "queue",
      arcDirection: "input",
      type: "inhibitor",
    }),
    applied("element", "addTypeElement", {
      typeId: "customer",
      element: { elementId: "age", name: "age", type: "real" },
    }),
    applied("place", "petrinaut_create_place", {
      editor_id: "process-editor",
      id: "queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    }),
    applied("place-moved", "petrinaut_update_place", {
      editor_id: "process-editor",
      placeId: "queue",
      position: { x: 100, y: 200 },
    }),
    applied("arc-moved", "petrinaut_update_arc", {
      editor_id: "process-editor",
      transitionId: "serve",
      arcDirection: "input",
      placeId: "queue",
      newPlaceId: "buffer",
      weight: 2,
    }),
  ];

  const attributed = (
    kind: Parameters<typeof callsForElement>[1]["kind"],
    id: string,
  ) => callsForElement(calls, { kind, id }).map(({ toolCallId }) => toolCallId);

  const arcAttributed = (placeId: string) =>
    callsForElement(calls, {
      kind: "arc",
      id: "arc",
      arc: {
        transitionId: toPetrinautId("serve"),
        arcDirection: "input",
        placeId: toPetrinautId(placeId),
      },
    }).map(({ toolCallId }) => toolCallId);

  test("a change is attributed by the element kinds its canonical tool targets, not by its name", () => {
    // An arc's type is its arc kind, never a token type that shares the ID.
    expect(attributed("type", "inhibitor")).toEqual([]);
    // A type element belongs to its type.
    expect(attributed("type", "customer")).toEqual(["element"]);
  });

  test("a HASH Petrinaut tool's change is attributed by the element kinds its canonical operation targets", () => {
    expect(attributed("place", toPetrinautId("queue"))).toEqual(["place"]);
  });

  test("a merged arc update is attributed, through the canonical calls it makes, to the arc it retargeted and reweighted", () => {
    expect(arcAttributed("buffer")).toEqual(["arc-moved"]);
    // The arc it moved away from keeps only its own changes.
    expect(arcAttributed("queue")).toEqual(["arc-kind"]);
  });

  test("a change written with the model's own ids is attributed to the converted element the document holds", () => {
    expect(attributed("type", toPetrinautId("customer"))).toEqual(["element"]);
    // Only values under id keys convert, so the element type `real` names no type.
    expect(attributed("type", toPetrinautId("real"))).toEqual([]);
  });

  test("a component is credited with the call that defined it under the subnet tool's name", () => {
    const net = {
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    };
    expect(
      callsForElement(
        [
          call(
            "define-desk",
            "addSubnet",
            { id: "desk", name: "Desk", ...net },
            { title: "Added component Desk", applied: true },
            { documentRevision: { before: "revision-2", after: "revision-3" } },
          ),
        ],
        { kind: "component", id: "desk" },
      ).map(({ toolCallId }) => toolCallId),
    ).toEqual(["define-desk"]);
  });

  test("a change the browser left unapplied, or that produced no revision, is credited to nothing", () => {
    const input = { id: "queue", name: "Queue" };
    expect(
      callsForElement(
        [
          call(
            "declined",
            "addPlace",
            input,
            { applied: false },
            { documentRevision: { before: "revision-2", after: "revision-3" } },
          ),
          call(
            "noop",
            "addPlace",
            input,
            { applied: false, reason: "Unchanged" },
            { documentRevision: { before: "revision-2" } },
          ),
        ],
        { kind: "place", id: "queue" },
      ),
    ).toEqual([]);
  });
});

test("an applied change is a call with an after revision that the browser did not decline", () => {
  const calls = [
    call(
      "add-queue",
      "addPlace",
      { id: "queue", name: "Queue" },
      { title: "Added place Queue", applied: true },
      { documentRevision: { before: "revision-1", after: "revision-2" } },
    ),
    call(
      "noop",
      "addPlace",
      { id: "queue", name: "Queue" },
      { applied: false, reason: "Unchanged" },
      { documentRevision: { before: "revision-2" } },
    ),
    call(
      "declined",
      "addPlace",
      { id: "dryer", name: "Dryer" },
      { applied: false },
      { documentRevision: { before: "revision-2", after: "revision-3" } },
    ),
    call(
      "read-queue",
      "getLatestNetDefinition",
      {},
      { title: "Queue", definition },
      { documentRevision: { before: "revision-2" } },
    ),
  ];
  expect(
    calls.filter(isAppliedChange).map(({ revisionAfter }) => revisionAfter),
  ).toEqual(["revision-2"]);
});

describe("latestNetDefinition", () => {
  const read = call(
    "read-queue",
    "getLatestNetDefinition",
    {},
    { title: "Queue", definition },
    { documentRevision: { before: "revision-2" } },
  );
  const dryer = { ...queue, id: "dryer", name: "Dryer" };

  test("is the latest read, at the revision it observed", () => {
    expect(latestNetDefinition([read])).toEqual({
      definition,
      call: read,
      revision: "revision-2",
    });
  });

  test("a filtered net read counts as the latest net read", () => {
    const outline = call(
      "outline",
      "readNetOutline",
      {},
      { title: "Queue", definition },
      { documentRevision: { before: "revision-2" } },
    );
    expect(latestNetDefinition([read, outline])?.call.toolCallId).toBe(
      "outline",
    );
  });

  test("is a later change's read-back, at the revision it produced", () => {
    const readBack = { ...definition, places: [queue, dryer] };
    const addDryer = call(
      "add-dryer",
      "addPlace",
      { id: "dryer", name: "Dryer" },
      { title: "Added place Dryer", applied: true },
      {
        documentRevision: { before: "revision-2", after: "revision-3" },
        readBack,
      },
    );
    expect(latestNetDefinition([read, addDryer])).toEqual({
      definition: readBack,
      call: addDryer,
      revision: "revision-3",
    });
  });

  test("a later change without a read-back leaves the read the latest", () => {
    const addDryer = call(
      "add-dryer",
      "addPlace",
      { id: "dryer", name: "Dryer" },
      { title: "Added place Dryer", applied: true },
      { documentRevision: { before: "revision-2", after: "revision-3" } },
    );
    expect(latestNetDefinition([read, addDryer])?.call).toBe(read);
    expect(latestNetDefinition([addDryer])).toBeUndefined();
  });
});

test("a result shows the net only as a read, or as a change carrying its read-back", () => {
  expect(
    netResultView("getLatestNetDefinition", {
      documentRevision: { before: "revision-2" },
    }),
  ).toEqual({ kind: "read", revision: "revision-2" });
  expect(netResultView("getLatestNetDefinition", undefined)).toEqual({
    kind: "read",
    revision: undefined,
  });
  expect(
    netResultView("addPlace", {
      documentRevision: { before: "revision-2", after: "revision-3" },
    }),
  ).toBeUndefined();
  expect(
    netResultView("addPlace", {
      documentRevision: { before: "revision-2", after: "revision-3" },
      readBack: definition,
    }),
  ).toEqual({ kind: "change", revision: "revision-3", readBack: definition });
  expect(netResultView("draft_petrinaut_experiment", {})).toBeUndefined();
});
