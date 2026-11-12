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
  type NetReaderLevel,
  netReaderToolNames,
  vNetReaderInput,
} from "@hashintel/brunch-agent";
import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  type BrowserToolDefinition,
  defineWaitingBrowserTool,
} from "./browser-call";

import type { HostBinding } from "../agent/host-binding";

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

const canonicalTools = CANONICAL_PETRINAUT_TOOL_NAMES.map(
  (name): BrowserToolDefinition<Record<string, unknown>> => {
    const { description, inputSchema } = petrinautAiTools[name];
    return {
      name,
      description,
      parameters: withoutDialect(
        (inputSchema as unknown as StandardJsonSchema)[
          "~standard"
        ].jsonSchema.input({ target: "draft-2020-12" }),
      ),
    };
  },
);

const netReaderTools = (
  Object.keys(netReaderToolNames) as NetReaderLevel[]
).map((level): BrowserToolDefinition<Record<string, unknown>> => ({
  name: netReaderToolNames[level],
  description: netReaderDescriptions[level],
  parameters: withoutDialect(toJsonSchema(vNetReaderInput)),
}));

/**
 * The Petrinaut browser tools as the model receives them: name, description
 * and parameter JSON Schema, in order. The tools themselves are built per
 * host by `createPetrinautBrowserToolsExtension`.
 */
export const petrinautBrowserTools: readonly BrowserToolDefinition<
  Record<string, unknown>
>[] = [...canonicalTools, ...netReaderTools];

const extensionName = "brunch.petrinaut-browser-tools";

/**
 * The Petrinaut browser tools over one Harness's host binding, through which
 * each document change reads the model's view of the net when it is issued.
 * Their `BrowserCall` tasks are registered by `browserCallExtension`, which
 * must be installed beside it; its own `setNetTitle` is shadowed by
 * selecting this extension instead.
 */
export const createPetrinautBrowserToolsExtension = (host: HostBinding) =>
  defineExtension({
    name: extensionName,
    tools: petrinautBrowserTools.map((definition) =>
      defineWaitingBrowserTool(definition, { host }),
    ),
  });
