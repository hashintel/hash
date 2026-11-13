/**
 * The HASH agent's browser tools, as waiting browser tools built from the
 * library's catalogue: HASH's 39 Petrinaut tools (`hashPetrinautTools`), the
 * three graph reads and Save (`hash-agent-port.md` §2, §3.2–3.5). Names,
 * descriptions, input schemas and what the model is shown of a result all
 * come from `@hashintel/brunch-agent`, as Brunch's HASH agent on Flue takes
 * them; the facts each decision needs come from `browserToolFacts`.
 *
 * Each tool parses its input with its own schema before issuing it, so an
 * input the schema refuses is never issued (Pi checks the JSON Schema only).
 * A Petrinaut tool naming another editor is refused before net freshness, and
 * a change with no view is refused naming HASH's read.
 *
 * Save's description names the bound `documentId`, which is known only per
 * conversation, so Save is its own extension, built per binding and installed
 * into a Harness's registry once the binding is known.
 */
import { copyJson, type JsonValue } from "@earendil-works/chord";
import {
  defineExtension,
  type ToolRegistration,
} from "@earendil-works/pi-durable";
import { toJsonSchema } from "@valibot/to-json-schema";

import {
  brunchTools,
  hashEntityReadDescription,
  hashEntityReadForModel,
  hashEntityTypeReadDescription,
  hashEntityTypeReadForModel,
  hashNoNetViewRefusal,
  hashPetrinautTools,
  type HashPetrinautToolName,
  hashProcessEditorId,
  hashReadFailureForModel,
  hashSaveDescription,
  hashSaveForModel,
  hashSaveUnconfirmedNote,
  hashWebReadDescription,
  hashWebReadForModel,
  parseHashEntityReadInput,
  parseHashEntityTypeReadInput,
  parseHashSaveInput,
  parseHashWebReadInput,
  unknownEditorRefusal,
  vHashEntityReadInput,
  vHashEntityTypeReadInput,
  vHashSaveInput,
  vHashWebReadInput,
} from "@hashintel/brunch-agent";

import {
  browserCallUnstartedError,
  type BrowserToolAdapters,
  type BrowserToolDefinition,
  defineWaitingBrowserTool,
} from "./browser-call";

import type { HostBinding } from "../agent/host-binding";
import type * as v from "valibot";

type JsonSchemaObject = Record<string, unknown>;

/** A HASH Petrinaut tool's zod input, as this module uses it: its parser and its Standard JSON Schema export. */
type HashPetrinautInput = {
  readonly parse: (input: unknown) => { readonly editor_id: string };
  readonly "~standard": {
    readonly jsonSchema: {
      readonly input: (options: {
        readonly target: "draft-2020-12";
      }) => JsonSchemaObject;
    };
  };
};

/** A native schema's input JSON Schema, as Flue's `toolInputToJsonSchema` exports it (`$schema` kept). */
const zodParameters = (zInput: HashPetrinautInput) =>
  structuredClone(
    zInput["~standard"].jsonSchema.input({ target: "draft-2020-12" }),
  );

/** A Valibot schema's JSON Schema without `$schema`, as Flue's `valibotToJsonSchema` converts it. */
const valibotParameters = (schema: v.GenericSchema): JsonSchemaObject => {
  const { $schema: _dialect, ...jsonSchema } = toJsonSchema(schema, {
    errorMode: "ignore",
  });
  return jsonSchema;
};

/** One HASH browser tool: its definition, and the waiting tool over a host. */
type HashBrowserTool = {
  readonly definition: BrowserToolDefinition<JsonSchemaObject>;
  readonly create: (host: HostBinding) => ToolRegistration<JsonSchemaObject>;
};

/** A HASH browser tool: `definition`, adapted by `adapters`, refusing a change with no view in HASH's words. */
const hashBrowserTool = <TInput>(
  definition: BrowserToolDefinition<JsonSchemaObject>,
  adapters: BrowserToolAdapters<TInput>,
): HashBrowserTool => ({
  definition,
  create: (host) =>
    defineWaitingBrowserTool<JsonSchemaObject, TInput>(definition, {
      ...adapters,
      host,
      noViewRefusal: hashNoNetViewRefusal,
    }),
});

/** HASH's Petrinaut tools: zod-parsed, and refused before issue when they name another editor. */
const petrinautTools = (
  Object.keys(hashPetrinautTools) as HashPetrinautToolName[]
).map((name) => {
  const {
    description,
    zInput,
  }: { readonly description: string; readonly zInput: HashPetrinautInput } =
    hashPetrinautTools[name];
  return hashBrowserTool(
    { name, description, parameters: zodParameters(zInput) },
    {
      parseInput: (args) => zInput.parse(args),
      refuse: ({ editor_id: editorId }) =>
        editorId === hashProcessEditorId
          ? undefined
          : unknownEditorRefusal(editorId),
    },
  );
});

/** What the model is shown of a graph read: its failure, or the rendered text. */
const graphReadPresent =
  <TInput>(forModel: (output: unknown, input: TInput) => string) =>
  (output: JsonValue, input: TInput): JsonValue =>
    hashReadFailureForModel(output) ?? forModel(output, input);

/** HASH's graph reads: text the model reads, never a view of the net. */
const graphReadTools = [
  hashBrowserTool(
    {
      name: brunchTools.hashQueryEntities,
      description: hashEntityReadDescription,
      parameters: valibotParameters(vHashEntityReadInput),
    },
    {
      parseInput: parseHashEntityReadInput,
      present: graphReadPresent((output, { fullValuesFor }) =>
        hashEntityReadForModel(output, fullValuesFor),
      ),
    },
  ),
  hashBrowserTool(
    {
      name: brunchTools.hashQueryEntityTypes,
      description: hashEntityTypeReadDescription,
      parameters: valibotParameters(vHashEntityTypeReadInput),
    },
    {
      parseInput: parseHashEntityTypeReadInput,
      present: graphReadPresent(hashEntityTypeReadForModel),
    },
  ),
  hashBrowserTool(
    {
      name: brunchTools.hashQueryWebs,
      description: hashWebReadDescription,
      parameters: valibotParameters(vHashWebReadInput),
    },
    {
      parseInput: parseHashWebReadInput,
      present: graphReadPresent(hashWebReadForModel),
    },
  ),
];

/**
 * Save's description before the conversation's binding is known. The host
 * installs the bound Save before any request (`createHashSaveExtension`), so
 * no model is meant to see it.
 */
export const placeholderSaveDescription =
  "Save the net open in the editor to HASH as a new version. No editor is open yet, so it cannot be called.";

/** Save for the net open as `documentId`; with none, the placeholder, which refuses every call unissued. */
const saveTool = (documentId: string | undefined) =>
  hashBrowserTool(
    {
      name: brunchTools.appSaveNet,
      description:
        documentId === undefined
          ? placeholderSaveDescription
          : hashSaveDescription(documentId),
      parameters: valibotParameters(vHashSaveInput),
    },
    {
      parseInput: parseHashSaveInput,
      ...(documentId === undefined
        ? { refuse: () => browserCallUnstartedError }
        : {}),
      // A declined save is a result, `{ saved: false, reason }`; an unknown shape throws, and may have followed a started save.
      present: (output) => copyJson(hashSaveForModel(output)),
      mayHaveRunNote: hashSaveUnconfirmedNote,
    },
  );

/**
 * Every HASH browser tool as the model receives it, in order: the 39
 * Petrinaut tools, the three graph reads, then Save, its description naming
 * `documentId` (the placeholder's without one).
 */
export const hashBrowserToolDefinitions = (
  documentId?: string,
): readonly BrowserToolDefinition<JsonSchemaObject>[] =>
  [...petrinautTools, ...graphReadTools, saveTool(documentId)].map(
    ({ definition }) => definition,
  );

/** One name for every version of Save, so a conversation's stored selection always resolves. */
export const hashSaveExtensionName = "brunch.hash-save";

/**
 * The HASH browser tools but Save, over one Harness's host binding, through
 * which a change reads the model's view of the net when it is issued. Their
 * `BrowserCall` tasks are registered by `browserCallExtension`, which must be
 * installed beside it.
 */
export const createHashBrowserToolsExtension = (host: HostBinding) =>
  defineExtension({
    name: "brunch.hash-browser-tools",
    tools: [...petrinautTools, ...graphReadTools].map(({ create }) =>
      create(host),
    ),
  });

/**
 * Save for one conversation, over its Harness's host binding: its description
 * names the bound `documentId`. Installed under `hashSaveExtensionName`, it
 * replaces the Harness's Save; without a `documentId` it is the placeholder a
 * registry holds before the binding is known. Pi stores none of it, so the
 * host installs the bound Save again whenever it opens the Harness.
 */
export const createHashSaveExtension = (
  host: HostBinding,
  documentId?: string,
) =>
  defineExtension({
    name: hashSaveExtensionName,
    tools: [saveTool(documentId).create(host)],
  });
