/**
 * The library registers HASH's graph reads with an identity parse, so the
 * input the server issues to the browser is the model's as it is. That holds
 * only while every read's schema parses valid input to itself: no defaults,
 * no transforms.
 */
import * as v from "valibot";
import { expect, test } from "vitest";

import {
  browserExecutedToolInputSchemas,
  brunchTools,
  hashGraphReadToolNames,
} from "@hashintel/brunch-agent";

import { createHashGraphReadTools } from "./hash-graph-reads.ts";

const webId = "4d1c8f2a-6b0e-4f3a-9c55-1e2d3f4a5b6c";
const entityUuid = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const draftId = "0f1e2d3c-4b5a-4968-8776-655443322110";

/** Valid input for each read, with every field the read takes. */
const sampleInputs: Readonly<Record<string, unknown>> = {
  [brunchTools.queryHashEntities]: {
    entityTypes: ["Supplier", "Organization"],
    webIds: [webId],
    entityIds: [`${webId}~${entityUuid}`, `${webId}~${entityUuid}~${draftId}`],
    traversalDepth: 3,
    includeDrafts: true,
  },
  [brunchTools.queryHashEntityTypes]: {
    entityTypeIds: ["https://hash.ai/@alice/types/entity-type/supplier/v/1"],
    webIds: [webId],
  },
  [brunchTools.queryHashWebs]: {},
};

const toolsByName = new Map(
  createHashGraphReadTools(() =>
    Promise.reject(new Error("No read reaches the browser here.")),
  ).map((tool) => [tool.name, tool] as const),
);

test.each([...hashGraphReadToolNames])(
  "%s parses valid input to the input itself, as the library's identity parse assumes",
  (name) => {
    const tool = toolsByName.get(name);
    const sample = sampleInputs[name];
    expect(tool, `The HASH agent defines no tool ${name}.`).toBeDefined();
    expect(sample, `No sample input for ${name}.`).toBeDefined();
    if (!tool) return;

    expect(v.parse(tool.input, sample)).toStrictEqual(sample);
    expect(browserExecutedToolInputSchemas[name]?.parse(sample)).toBe(sample);
  },
);

test("the HASH agent defines no read the library doesn't register", () => {
  expect([...toolsByName.keys()].sort()).toEqual(
    [...hashGraphReadToolNames].sort(),
  );
});
