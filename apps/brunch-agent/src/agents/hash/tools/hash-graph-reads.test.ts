/**
 * How the HASH agent wires in its graph reads. What the model is shown of each
 * read is pinned in `@hashintel/brunch-agent`, beside the renderer; the reads'
 * path through the agent is in `../hash-agent-graph-reads.test.ts`.
 */
import { expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { createHashGraphReadTools } from "./hash-graph-reads.ts";

test("the HASH agent defines its three graph reads", () => {
  const tools = createHashGraphReadTools(() =>
    Promise.reject(new Error("No read reaches the browser here.")),
  );
  expect(tools.map(({ name }) => name).toSorted()).toEqual(
    [
      brunchTools.hashQueryEntities,
      brunchTools.hashQueryEntityTypes,
      brunchTools.hashQueryWebs,
    ].toSorted(),
  );
});
