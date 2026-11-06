/**
 * The Petrinaut tools Brunch's panel executes, as waiting browser tools:
 * every canonical Petrinaut AI tool (mutations, commands, the net and doc
 * reads, `createExperiment`) and Brunch's filtered net readers. Names,
 * wording and schemas come from the sources Brunch's own Petrinaut agent
 * uses (`apps/brunch-agent/src/shared/petrinaut-tools/petrinaut-construction.ts`):
 * `CANONICAL_PETRINAUT_TOOL_NAMES` with `@hashintel/petrinaut-core/ai`, and
 * the library's net-reader exports. Brunch's reviewed experiment draft
 * (`draft_petrinaut_experiment`) is left out: it needs history authorization.
 */
import { defineExtension } from "@earendil-works/pi-durable";
import { toJsonSchema } from "@valibot/to-json-schema";

import {
  CANONICAL_PETRINAUT_TOOL_NAMES,
  netReaderDescriptions,
  netReaderInputSchema,
  type NetReaderLevel,
  netReaderToolNames,
} from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import { defineWaitingBrowserTool } from "./browser-call";

/** A Zod schema's input JSON Schema, through Zod's Standard JSON Schema converter. */
type StandardJsonSchema = {
  readonly "~standard": {
    readonly jsonSchema: {
      readonly input: (options: {
        readonly target: "draft-2020-12";
      }) => Record<string, unknown>;
    };
  };
};

/** Without `$schema`, as `ledger.ts` sends the Ledger's schema. */
const withoutDialect = <Schema extends { readonly $schema?: unknown }>({
  $schema: _dialect,
  ...jsonSchema
}: Schema) => jsonSchema;

const canonicalTools = CANONICAL_PETRINAUT_TOOL_NAMES.map((name) => {
  const { description, inputSchema } = petrinautAiTools[name];
  return defineWaitingBrowserTool({
    name,
    description,
    parameters: withoutDialect(
      (inputSchema as unknown as StandardJsonSchema)[
        "~standard"
      ].jsonSchema.input({ target: "draft-2020-12" }),
    ),
  });
});

const netReaderTools = (
  Object.keys(netReaderToolNames) as NetReaderLevel[]
).map((level) =>
  defineWaitingBrowserTool({
    name: netReaderToolNames[level],
    description: netReaderDescriptions[level],
    parameters: withoutDialect(toJsonSchema(netReaderInputSchema)),
  }),
);

export const petrinautBrowserTools = [...canonicalTools, ...netReaderTools];

/**
 * The Petrinaut browser tools. Their `BrowserCall` tasks are registered by
 * `browserCallExtension`, which must be installed beside it; its own
 * `setNetTitle` is shadowed by selecting this extension instead.
 */
export const petrinautBrowserToolsExtension = defineExtension({
  name: "brunch.petrinaut-browser-tools",
  tools: petrinautBrowserTools,
});
