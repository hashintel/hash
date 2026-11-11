import { expect, test } from "vitest";

import { petrinautBrowserTools } from "./petrinaut-browser-tools";

/**
 * The Petrinaut browser tools as the model receives them: name, description
 * and parameter JSON Schema, in order. The snapshot pins what a real OpenAI
 * run accepted; a change to it is a change to what the model is sent, from
 * this package's conversion or from the libraries' tool definitions.
 */
test("the Petrinaut browser tools reach the model with the pinned definitions", async () => {
  const definitions = petrinautBrowserTools.map(
    ({ name, description, parameters }) => ({ name, description, parameters }),
  );
  expect(definitions).toHaveLength(49);
  await expect(`${JSON.stringify(definitions, null, 2)}\n`).toMatchFileSnapshot(
    "./__snapshots__/petrinaut-browser-tools.snap.json",
  );
});
