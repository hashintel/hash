/**
 * The JSON-schema view of the plugin contract, derived from the valibot schema
 * so there is one source of truth. Kept out of the public export surface: it
 * is for the snapshot test that emits `schema/plugin.schema.json`, not for plugins.
 */
import { toJsonSchema } from "@valibot/to-json-schema";

import { PluginDefinitionSchema } from "./plugin-definition";

export const pluginJsonSchema = (): Record<string, unknown> => ({
  $id: "https://hash.ai/brunch-agent/plugin.schema.json",
  title: "Brunch plugin definition",
  description:
    "A plugin is data under harness-owned keys (ADR-0007). Cross-references the schema cannot state — rows name declared kinds, the anchor is a row, runbooks belong to declared jobs — are checked by readPluginDefinition.",
  ...toJsonSchema(PluginDefinitionSchema, { errorMode: "ignore" }),
});
