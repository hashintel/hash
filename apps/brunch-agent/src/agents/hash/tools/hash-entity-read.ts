/**
 * The HASH entity read's contract: its name, the input the model gives it,
 * and what the model is shown of its result. HASH's process page executes it
 * as the signed-in user; this module never reaches HASH, so it can move into a
 * shared package with no executor attached.
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

/**
 * No defaults or transforms: the browser compares the input it was issued
 * with the model's call as it is. HASH's page applies the defaults.
 */
export const hashEntityReadInputSchema = v.strictObject({
  entityTypes: identifiers(
    "Entity types to match, each a type's title (for example `Organization`) or its versioned URL. Entities of any listed type match.",
  ),
  webIds: identifiers(
    "Web ids to read from. An entity belongs to the web of the user or organization that owns it.",
  ),
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
  "Read entities from the HASH graph, as the signed-in user: only what they may see is returned, so an entity that is absent may exist but be hidden from them. Filters combine: an entity must match every filter given. Returns { entities }, each with its entityId, editionId (the exact version read), webId, entityTypeIds, properties (keyed by property type URL), draft, whether it matched the filters (matched) or was reached by following links, and, for a link entity, its linkData.";

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

/** What the model is shown of a settled read. */
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

/** The read, executed by whatever `execute` reaches HASH through. */
export const createHashEntityReadTool = (execute: BrowserToolExecutor) =>
  defineTool({
    name: brunchTools.queryHashEntities,
    description: hashEntityReadDescription,
    input: hashEntityReadInputSchema,
    async run({ data, toolCallId, signal }) {
      const result = await execute({
        toolName: brunchTools.queryHashEntities,
        input: data,
        toolCallId,
        signal,
      });
      return {
        output: browserResultEnvelope({
          ...result,
          output: hashEntityReadForModel(result.output),
        }),
        terminate: false,
      };
    },
  });
