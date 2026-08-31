import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

import { pluginJsonSchema } from "../src/plugin-json-schema";

const target = fileURLToPath(
  new URL("../schema/plugin.schema.json", import.meta.url),
);
const emitting = process.env.PLUGIN_SCHEMA_EMIT === "1";

/**
 * `schema/plugin.schema.json` is the emitted view of `PluginDefinitionSchema`.
 * `yarn schema:emit` rewrites it after a deliberate schema change (and the
 * change goes in `schema/CHANGELOG.md`); an unrewritten drift fails here. The
 * comparison is structural so that the repo formatter may lay the file out.
 */
test.runIf(emitting)("emits schema/plugin.schema.json", () => {
  writeFileSync(target, `${JSON.stringify(pluginJsonSchema(), null, 2)}\n`);
  expect(true).toBe(true);
});

test.skipIf(emitting)(
  "schema/plugin.schema.json is the emitted view of PluginDefinitionSchema",
  () => {
    const committed = JSON.parse(readFileSync(target, "utf8")) as unknown;
    expect(committed).toEqual(pluginJsonSchema());
  },
);
