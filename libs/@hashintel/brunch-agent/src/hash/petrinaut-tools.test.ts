import { expect, test } from "vitest";

import { toPetrinautId } from "@hashintel/petrinaut-core";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  hashPetrinautTools,
  hashProcessEditorId,
  hashReplacedPetrinautOperations,
} from "./petrinaut-tools";

/** Catalogue operations the HASH agent still mounts under Petrinaut's names, until their own tools exist. */
const stillCanonical = ["readPetrinautDoc"];
/** Catalogue operations the HASH agent drops for its per-kind tools. */
const dropped = ["deleteItemsByIds", "commitNodePositions"];

test("every catalogue operation is run by one of HASH's tools, dropped, or still canonical for now", () => {
  const mapped = Object.values(hashPetrinautTools).flatMap(
    ({ operations }) => operations,
  );
  // Each operation has one HASH tool.
  expect(new Set(mapped).size).toBe(mapped.length);
  expect([...mapped, ...dropped, ...stillCanonical].toSorted()).toEqual(
    Object.keys(petrinautAiTools).toSorted(),
  );
  expect([...hashReplacedPetrinautOperations].toSorted()).toEqual(
    [...mapped, ...dropped].toSorted(),
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
