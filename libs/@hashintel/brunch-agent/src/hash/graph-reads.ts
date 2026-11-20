/**
 * The contract of the HASH graph reads that HASH's process page runs as the
 * signed-in user for Brunch's HASH agent: the input each read takes, the
 * result and failure the page settles it with, and the traversal rules both
 * sides apply. The agent describes the reads to the model and renders their
 * results; the page builds the queries.
 */

import * as v from "valibot";

import { brunchTools } from "../constants";

/** How many links an entity read follows when the model names no depth. */
export const hashEntityReadDefaultTraversalDepth = 1;

/**
 * The deepest an entity read follows links. The graph takes at most 10 paths
 * of at most 10 edges, and the page's paths for this depth are 8 chains of 6
 * edges and the 2 link endpoints.
 */
export const hashEntityReadMaxTraversalDepth = 3;

/**
 * List length and id length are deliberately unbounded: the page reads as the
 * signed-in user, and the graph enforces its own limits.
 */
const identifiersSchemaWith = ({ description }: { description: string }) =>
  v.optional(
    v.pipe(
      v.array(v.pipe(v.string(), v.minLength(1))),
      v.minLength(1),
      v.description(description),
    ),
  );

const webIdsDescription =
  "Web ids to read from. An entity belongs to the web of the user or organization that owns it.";

export const hashEntityReadInputSchema = v.strictObject({
  entityTypes: identifiersSchemaWith({
    description:
      "Entity type titles to match, for example `Organization`. A title matches every type with that title, in any web and at any version; a versioned entityTypeId matches that type version only. Entities of any listed type match.",
  }),
  webIds: identifiersSchemaWith({ description: webIdsDescription }),
  entityIds: identifiersSchemaWith({
    description:
      "Entity ids to read, for example ids returned by an earlier read: `webId~entityUuid`, or `webId~entityUuid~draftId` for a draft. An id with a draft part reads that draft.",
  }),
  traversalDepth: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(hashEntityReadMaxTraversalDepth),
      v.description(
        `How many links to follow from the matched entities, at most ${hashEntityReadMaxTraversalDepth}. Each link is followed in either direction, so mixed chains such as A → B ← C are included; a matched link entity's own endpoints are included too. 0 returns only the matches. Defaults to ${hashEntityReadDefaultTraversalDepth}.`,
      ),
    ),
  ),
  includeDrafts: v.optional(
    v.pipe(
      v.boolean(),
      v.description(
        "Whether to include draft entities. Defaults to false. An entity id with a draft part reads that draft either way, along with reached draft links whose left or right endpoint is an explicitly named draft. This exception does not include other draft endpoint records or recursively include further draft links; link endpoint ids remain intact.",
      ),
    ),
  ),
  fullValuesFor: v.optional(
    v.pipe(
      v.array(
        v.union([
          v.pipe(v.string(), v.minLength(1)),
          v.strictObject({
            entityId: v.pipe(v.string(), v.minLength(1)),
            path: v.pipe(
              v.array(v.pipe(v.string(), v.minLength(1))),
              v.minLength(1),
              v.description(
                'Where the part is: the property\'s name as the read shows it, then the keys or array positions inside its value, for example ["definition_object", "parameters"] or ["definition_object", "places", "0"].',
              ),
            ),
          }),
        ]),
      ),
      v.minLength(1),
      v.description(
        "Values to show where the read would otherwise summarise them. An entity id shows all of that entity's values in full, as JSON. { entityId, path } shows one value or part of one: in full when it fits, else outlined one level down with each part summarised, so you can read a path inside it. Neither changes which entities are read: read them by entityIds too.",
      ),
    ),
  ),
});

export type HashEntityReadInput = v.InferOutput<
  typeof hashEntityReadInputSchema
>;

export const parseHashEntityReadInput = (input: unknown): HashEntityReadInput =>
  v.parse(hashEntityReadInputSchema, input);

export const hashEntityTypeReadInputSchema = v.strictObject({
  entityTypeIds: identifiersSchemaWith({
    description: `Entity types to read, each a versioned URL as an entity's entityTypeIds name it, for example from ${brunchTools.hashQueryEntities}. Those exact versions are read.`,
  }),
  webIds: identifiersSchemaWith({
    description:
      "Web ids whose own entity types to list. Most types live in HASH's shared webs, not the user's or their organizations'.",
  }),
});

export type HashEntityTypeReadInput = v.InferOutput<
  typeof hashEntityTypeReadInputSchema
>;

export const parseHashEntityTypeReadInput = (
  input: unknown,
): HashEntityTypeReadInput => v.parse(hashEntityTypeReadInputSchema, input);

/**
 * One entity type to count: a title, or a versioned URL. An unversioned type
 * URL would match nothing, so it is refused with what to give instead.
 */
const hashEntityTypeSelectorSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check(
    (selector) =>
      !/^https?:\/\//u.test(selector) || /\/v\/[1-9]\d*$/u.test(selector),
    "An entity type URL needs its version, as in …/sales-order/v/1: copy the entityTypeId from a read, or give the type's title instead.",
  ),
);

export const hashEntityCountInputSchema = v.strictObject({
  entityTypes: v.optional(
    v.pipe(
      v.array(hashEntityTypeSelectorSchema),
      v.minLength(1),
      v.description(
        "Entity types to count, each a title such as `Sales Order`, matching every type with that title at any version, or a versioned entityTypeId, matching that version only. Entities of any listed type are counted. Omit to count every entity, links included.",
      ),
    ),
  ),
  webIds: identifiersSchemaWith({
    description: `Web ids to count in. Omit to count in the user's own web and their organizations' webs, as ${brunchTools.hashQueryWebs} lists them; name webs to count in others.`,
  }),
});

export type HashEntityCountInput = v.InferOutput<
  typeof hashEntityCountInputSchema
>;

export const parseHashEntityCountInput = (
  input: unknown,
): HashEntityCountInput => v.parse(hashEntityCountInputSchema, input);

export const hashWebReadInputSchema = v.strictObject({});

export const parseHashWebReadInput = (input: unknown) =>
  v.parse(hashWebReadInputSchema, input);

/**
 * A read whose query failed in HASH's page: the page settles the call with
 * the failure's message rather than failing it, so the model can read why.
 */
export const hashReadFailureSchema = v.object({ error: v.string() });

export type HashReadFailure = v.InferOutput<typeof hashReadFailureSchema>;

/**
 * The graph returns at most a page of matches, and the page reports
 * `truncated` when it stopped there; the reads don't fetch further pages.
 */
const truncatedSchema = v.optional(v.literal(true));

/** One entity as HASH's page returns it: every field comes from the same returned edition. */
const hashEntitySchema = v.object({
  entityId: v.string(),
  /** The entity's name as HASH labels it, where it has one. */
  label: v.optional(v.string()),
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

export const hashEntityReadResultSchema = v.object({
  /** Candidate definitions selected by key matches, not per-value applicability. */
  propertyTypes: v.array(
    v.object({
      baseUrl: v.string(),
      propertyTypeId: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
    }),
  ),
  /** The title of each entity type the entities carry. */
  entityTypes: v.array(
    v.object({ entityTypeId: v.string(), title: v.string() }),
  ),
  entities: v.array(hashEntitySchema),
  truncated: truncatedSchema,
});

export type HashEntityReadResult = v.InferOutput<
  typeof hashEntityReadResultSchema
>;

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

export const hashEntityTypeReadResultSchema = v.object({
  entityTypes: v.array(hashEntityTypeSchema),
  truncated: truncatedSchema,
});

export type HashEntityTypeReadResult = v.InferOutput<
  typeof hashEntityTypeReadResultSchema
>;

const hashWebKindSchema = v.picklist(["user", "organization"]);

export const hashWebReadResultSchema = v.object({
  webs: v.array(
    v.object({
      webId: v.string(),
      kind: hashWebKindSchema,
      shortname: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  ),
});

export type HashWebReadResult = v.InferOutput<typeof hashWebReadResultSchema>;

const countSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

/**
 * An exact count of the entities a count's filters match that the signed-in
 * user may see, by each entity's direct types and by web; it lists none.
 */
export const hashEntityCountResultSchema = v.object({
  count: countSchema,
  /**
   * Which webs were counted: the user's own and organization webs when the
   * input named none (`default`), else the webs it named.
   */
  webScope: v.picklist(["default", "named"]),
  /**
   * Each direct type a counted entity carries; an entity of several types is
   * counted under each.
   */
  entityTypes: v.array(
    v.object({
      entityTypeId: v.string(),
      title: v.optional(v.string()),
      count: countSchema,
    }),
  ),
  /** Every web counted in, named where the page knows it, with its count. */
  webs: v.array(
    v.object({
      webId: v.string(),
      kind: v.optional(hashWebKindSchema),
      shortname: v.optional(v.string()),
      name: v.optional(v.string()),
      count: countSchema,
    }),
  ),
});

export type HashEntityCountResult = v.InferOutput<
  typeof hashEntityCountResultSchema
>;
