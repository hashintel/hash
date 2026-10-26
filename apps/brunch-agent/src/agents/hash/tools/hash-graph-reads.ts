/**
 * The contracts of the HASH agent's graph reads: each read's name, the input
 * the model gives it, and what the model is shown of its result. HASH's
 * process page executes them as the signed-in user; this module never reaches
 * HASH, so it can move into a shared package with no executor attached.
 */

import { defineTool } from "@flue/runtime";
import * as v from "valibot";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  type BrowserToolExecutor,
  browserResultEnvelope,
} from "../../../shared/petrinaut-tools/petrinaut-construction.ts";

/** The deepest link traversal a read may ask for. */
export const maxHashEntityTraversalDepth = 5;

const identifiers = (description: string) =>
  v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1))),
      v.minLength(1),
      v.description(description),
    ),
  );

const webIdsDescription =
  "Web ids to read from. An entity belongs to the web of the user or organization that owns it.";

/**
 * A read whose query failed in HASH's page: the page settles the call with
 * the failure's message rather than failing it, so the model can read why.
 */
const hashReadFailureSchema = v.object({ error: v.string() });

/** What the model is shown of a read that failed in HASH's page. */
const hashReadFailureForModel = (output: unknown) => {
  const parsed = v.safeParse(hashReadFailureSchema, output);
  return parsed.success
    ? {
        error: parsed.output.error,
        note: "The read failed; the document is unchanged.",
      }
    : undefined;
};

/** Issues one read to HASH's page and shows the model what it settled with. */
const runHashRead = async (
  execute: BrowserToolExecutor,
  call: {
    readonly toolName: string;
    readonly input: unknown;
    readonly toolCallId: string;
    readonly signal?: AbortSignal;
  },
  forModel: (output: unknown) => unknown,
) => {
  const result = await execute(call);
  return {
    output: browserResultEnvelope({
      ...result,
      output: hashReadFailureForModel(result.output) ?? forModel(result.output),
    }),
    terminate: false,
  };
};

/**
 * No defaults or transforms: the browser compares the input it was issued
 * with the model's call as it is. HASH's page applies the defaults.
 */
export const hashEntityReadInputSchema = v.strictObject({
  entityTypes: identifiers(
    "Entity types to match, each a type's title (for example `Organization`) or its versioned URL. Entities of any listed type match.",
  ),
  webIds: identifiers(webIdsDescription),
  entityIds: identifiers(
    "Entity ids to read, for example ids returned by an earlier read.",
  ),
  traversalDepth: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(maxHashEntityTraversalDepth),
      v.description(
        "How many links to follow from the matched entities, in either direction. 0 returns only the matches. Defaults to 1.",
      ),
    ),
  ),
  includeDrafts: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Whether to include draft entities. Defaults to false."),
    ),
  ),
});

export type HashEntityReadInput = v.InferOutput<
  typeof hashEntityReadInputSchema
>;

export const hashEntityReadDescription =
  "Read entities from the HASH graph, as the signed-in user: only what they may see is returned, so an entity that is absent may exist but be hidden from them. Filters combine: an entity must match every filter given. Returns { entities }, each with its entityId, editionId (the exact version read), webId, entityTypeIds, properties (keyed by property type URL), draft, whether it matched the filters (matched) or was reached by following links, and, for a link entity, its linkData. A read that failed returns { error }.";

/** One entity as HASH's page returns it: every field comes from the same returned edition. */
const hashEntitySchema = v.object({
  entityId: v.string(),
  editionId: v.string(),
  webId: v.string(),
  entityTypeIds: v.array(v.string()),
  properties: v.record(v.string(), v.unknown()),
  draft: v.boolean(),
  matched: v.boolean(),
  linkData: v.optional(
    v.object({ leftEntityId: v.string(), rightEntityId: v.string() }),
  ),
});

const hashEntityReadResultSchema = v.object({
  entities: v.array(hashEntitySchema),
});

export type HashEntityReadResult = v.InferOutput<
  typeof hashEntityReadResultSchema
>;

/** What the model is shown of a settled entity read. */
export const hashEntityReadForModel = (output: unknown) => {
  const parsed = v.safeParse(hashEntityReadResultSchema, output);
  if (!parsed.success)
    throw new Error("HASH's page returned an entity read in an unknown shape.");
  const { entities } = parsed.output;
  return entities.length === 0
    ? {
        entities,
        note: "No entities matched that the signed-in user can see.",
      }
    : { entities };
};

/** The entity read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashEntities,
    description: hashEntityReadDescription,
    input: hashEntityReadInputSchema,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.queryHashEntities,
          input: data,
          toolCallId,
          signal,
        },
        hashEntityReadForModel,
      ),
  });

/** No defaults or transforms, as for the entity read. */
export const hashEntityTypeReadInputSchema = v.strictObject({
  webIds: identifiers(
    "Web ids whose own entity types to list. Without them, every entity type the signed-in user can see is listed, including public ones.",
  ),
});

export type HashEntityTypeReadInput = v.InferOutput<
  typeof hashEntityTypeReadInputSchema
>;

export const hashEntityTypeReadDescription =
  "List the entity types in the HASH graph that the signed-in user can see, at their latest version. Returns { entityTypes }, each with its entityTypeId (a versioned URL), title, description, properties (inherited ones included), each with its baseUrl (the key an entity's properties use) and title, and links, each with its linkEntityTypeId, title and the entity types it may point to (destinationEntityTypeIds, absent when any may). A type's title or entityTypeId can filter an entity read. A read that failed returns { error }.";

const hashEntityTypeSchema = v.object({
  entityTypeId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  properties: v.array(
    v.object({ baseUrl: v.string(), title: v.optional(v.string()) }),
  ),
  links: v.array(
    v.object({
      linkEntityTypeId: v.string(),
      title: v.optional(v.string()),
      destinationEntityTypeIds: v.optional(v.array(v.string())),
    }),
  ),
});

const hashEntityTypeReadResultSchema = v.object({
  entityTypes: v.array(hashEntityTypeSchema),
});

export type HashEntityTypeReadResult = v.InferOutput<
  typeof hashEntityTypeReadResultSchema
>;

/** What the model is shown of a settled entity type read. */
export const hashEntityTypeReadForModel = (output: unknown) => {
  const parsed = v.safeParse(hashEntityTypeReadResultSchema, output);
  if (!parsed.success)
    throw new Error(
      "HASH's page returned an entity type read in an unknown shape.",
    );
  const { entityTypes } = parsed.output;
  return entityTypes.length === 0
    ? {
        entityTypes,
        note: "No entity types matched that the signed-in user can see.",
      }
    : { entityTypes };
};

/** The entity type read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityTypeReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashEntityTypes,
    description: hashEntityTypeReadDescription,
    input: hashEntityTypeReadInputSchema,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.queryHashEntityTypes,
          input: data,
          toolCallId,
          signal,
        },
        hashEntityTypeReadForModel,
      ),
  });

export const hashWebReadInputSchema = v.strictObject({});

export const hashWebReadDescription =
  "List the signed-in user's own HASH web and the webs of the organizations they belong to. Returns { webs }, each with its webId, kind (user or organization), and its shortname and name where it has them. A web id can limit an entity or entity type read. A read that failed returns { error }.";

const hashWebReadResultSchema = v.object({
  webs: v.array(
    v.object({
      webId: v.string(),
      kind: v.picklist(["user", "organization"]),
      shortname: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  ),
});

export type HashWebReadResult = v.InferOutput<typeof hashWebReadResultSchema>;

/** What the model is shown of a settled web read. */
export const hashWebReadForModel = (output: unknown) => {
  const parsed = v.safeParse(hashWebReadResultSchema, output);
  if (!parsed.success)
    throw new Error("HASH's page returned a web read in an unknown shape.");
  return parsed.output;
};

/** The web read, executed by whatever `execute` reaches HASH through. */
export const createHashWebReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashWebs,
    description: hashWebReadDescription,
    input: hashWebReadInputSchema,
    run: ({ data, toolCallId, signal }) =>
      runHashRead(
        execute,
        {
          toolName: brunchTools.queryHashWebs,
          input: data,
          toolCallId,
          signal,
        },
        hashWebReadForModel,
      ),
  });

/** Every HASH graph read, executed by whatever `execute` reaches HASH through. */
export const createHashGraphReadTools = (execute: BrowserToolExecutor) => [
  createHashEntityReadTool(execute),
  createHashEntityTypeReadTool(execute),
  createHashWebReadTool(execute),
];
