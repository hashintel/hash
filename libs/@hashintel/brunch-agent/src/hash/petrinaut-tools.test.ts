import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  hashNoNetViewRefusal,
  hashPetrinautTools,
  hashProcessEditorId,
  unknownEditorRefusal,
} from "./petrinaut-tools";

/** Catalogue operations the HASH agent drops for its per-kind tools. */
const dropped = ["deleteItemsByIds", "commitNodePositions"];

test("every catalogue operation is run by one of HASH's tools or dropped, so none stays canonical", () => {
  const mapped = Object.values(hashPetrinautTools).flatMap(
    ({ operations }) => operations,
  );
  // Each operation has one HASH tool.
  expect(new Set(mapped).size).toBe(mapped.length);
  expect([...mapped, ...dropped].toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
});

test("a merged update makes the canonical calls its input names, its failable step first", () => {
  const { calls } = hashPetrinautTools.petrinaut_update_arc.parseCall({
    editor_id: hashProcessEditorId,
    transitionId: "serve",
    arcDirection: "input",
    placeId: "queue",
    newPlaceId: "buffer",
    type: "inhibitor",
    weight: 2,
  });
  expect(calls.map(({ toolName }) => toolName)).toEqual([
    "updateArcPlace",
    "updateArcType",
    "updateArcWeight",
  ]);
  // The later steps find the arc at its new endpoint.
  expect(calls[2]?.input).toMatchObject({
    placeId: toPetrinautId("buffer"),
    weight: 2,
  });
  // A call naming no change makes none, and requires nothing more than its operations do.
  expect(
    hashPetrinautTools.petrinaut_update_place.parseCall({
      editor_id: hashProcessEditorId,
      placeId: "queue",
    }).calls,
  ).toEqual([]);
});

test.each([
  { weight: 2 },
  { type: "inhibitor" },
  { newPlaceId: "buffer" },
  {
    placeId: "queue",
    endpoint: { kind: "place", placeId: "queue" },
    weight: 2,
  },
  {
    placeId: "queue",
    endpoint: { kind: "place", placeId: "queue" },
    newPlaceId: "buffer",
  },
  {
    placeId: "queue",
    newPlaceId: "buffer",
    newEndpoint: { kind: "place", placeId: "buffer" },
  },
])(
  "petrinaut_update_arc rejects ambiguous or missing endpoints before execution: %j",
  (change) => {
    expect(
      hashPetrinautTools.petrinaut_update_arc.zInput.safeParse({
        editor_id: hashProcessEditorId,
        transitionId: "serve",
        arcDirection: "input",
        ...change,
      }).success,
    ).toBe(false);
  },
);

test.each([
  { placeId: "queue", weight: 2 },
  { endpoint: { kind: "place", placeId: "queue" }, type: "inhibitor" },
  {
    endpoint: {
      kind: "componentPort",
      componentInstanceId: "worker",
      portPlaceId: "inbox",
    },
    weight: 2,
    targetSubnetId: "pipeline",
  },
  {
    placeId: "queue",
    newEndpoint: {
      kind: "componentPort",
      componentInstanceId: "worker",
      portPlaceId: "inbox",
    },
    weight: 2,
  },
  { placeId: "queue", newPlaceId: "queue", weight: 2 },
])(
  "petrinaut_update_arc accepts canonical endpoints and requested changes: %j",
  (change) => {
    const input = {
      editor_id: hashProcessEditorId,
      transitionId: "serve",
      arcDirection: "input",
      ...change,
    };
    expect(
      hashPetrinautTools.petrinaut_update_arc.zInput.safeParse(input).success,
    ).toBe(true);
    expect(
      hashPetrinautTools.petrinaut_update_arc.parseCall(input).calls.length,
    ).toBeGreaterThan(0);
  },
);

test("petrinaut_update_arc preserves calls requesting no change", () => {
  const input = {
    editor_id: hashProcessEditorId,
    transitionId: "serve",
    arcDirection: "input",
  };
  expect(
    hashPetrinautTools.petrinaut_update_arc.zInput.safeParse(input).success,
  ).toBe(true);
  expect(
    hashPetrinautTools.petrinaut_update_arc.parseCall(input).calls,
  ).toEqual([]);
});

test("petrinaut_update_arc rejects an input-arc type on an output arc", () => {
  expect(
    hashPetrinautTools.petrinaut_update_arc.zInput.safeParse({
      editor_id: hashProcessEditorId,
      transitionId: "serve",
      arcDirection: "output",
      placeId: "queue",
      type: "inhibitor",
    }).success,
  ).toBe(false);
  expect(() =>
    hashPetrinautTools.petrinaut_update_arc.parseCall({
      editor_id: hashProcessEditorId,
      transitionId: "serve",
      arcDirection: "output",
      placeId: "queue",
      type: "inhibitor",
    }),
  ).toThrow(/Output arcs do not have an input arc type/u);
});

const adHocInitialState = {
  type: "adhoc",
  content: {
    variables: [],
    netParameters: [],
    places: {
      queue: { kind: "uncoloured", count: { expression: "3", optimize: null } },
    },
  },
};

const perPlaceInitialState = { type: "per_place", content: { queue: "3" } };

const adHocRefusal = /cannot author an \W*adhoc\W* initial state.*per_place/u;

test("petrinaut_create_scenario refuses an ad-hoc initial state and takes a per-place one", () => {
  const scenario = {
    editor_id: hashProcessEditorId,
    id: "rush-hour",
    name: "Rush hour",
    scenarioParameters: [],
  };
  expect(() =>
    hashPetrinautTools.petrinaut_create_scenario.parseCall({
      ...scenario,
      initialState: adHocInitialState,
    }),
  ).toThrow(adHocRefusal);
  expect(
    hashPetrinautTools.petrinaut_create_scenario.parseCall({
      ...scenario,
      initialState: perPlaceInitialState,
    }).calls,
  ).toMatchObject([
    {
      toolName: "addScenario",
      input: { initialState: { type: "per_place" } },
    },
  ]);
});

test("petrinaut_update_scenario refuses setting an ad-hoc initial state, but edits an ad-hoc scenario otherwise", () => {
  const update = (fields: Record<string, unknown>) =>
    hashPetrinautTools.petrinaut_update_scenario.parseCall({
      editor_id: hashProcessEditorId,
      scenarioId: "disruption",
      update: fields,
    }).calls;
  expect(() => update({ initialState: adHocInitialState })).toThrow(
    adHocRefusal,
  );
  // A rename or a change of parameters leaves the initial state as it is.
  expect(
    update({
      name: "Port strike",
      scenarioParameters: [
        { type: "integer", identifier: "strike_days", default: 5 },
      ],
    }),
  ).toMatchObject([
    { toolName: "updateScenario", input: { update: { name: "Port strike" } } },
  ]);
  expect(update({ initialState: perPlaceInitialState })).toMatchObject([
    {
      toolName: "updateScenario",
      input: { update: { initialState: { type: "per_place" } } },
    },
  ]);
});

test("petrinaut_create_experiment enforces cross-field experiment rules on its input schema", () => {
  expect(() =>
    hashPetrinautTools.petrinaut_create_experiment.parseCall({
      editor_id: hashProcessEditorId,
      name: "Queue study",
      scenarioId: "scenario-1",
      scenarioParameterValues: {},
      runCount: 2,
      seed: 1,
      dt: 100,
      maxTime: 10,
      metricIds: ["metric-1", "metric-1"],
      execution: { mode: "simulate" },
    }),
  ).toThrow(/Metric IDs must be unique/u);
});

test("the refusals of a call that is not started are pinned", () => {
  expect(unknownEditorRefusal("other-editor")).toMatchInlineSnapshot(
    `"Not started: editor_id "other-editor" names no open editor; the open editor is "process-editor"."`,
  );
  expect(hashNoNetViewRefusal).toMatchInlineSnapshot(
    `"Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (petrinaut_get_net), then make the change."`,
  );
});
