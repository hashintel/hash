import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { hashPetrinautTools, hashProcessEditorId } from "./petrinaut-tools";

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

test("petrinaut_update_arc rejects an input-arc type on an output arc", () => {
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
