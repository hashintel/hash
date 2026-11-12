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

export const vHashEntityReadInput = v.strictObject({
  entityTypes: identifiers(
    "Entity type titles to match, for example `Organization`. A title matches every type with that title, in any web and at any version; a versioned entityTypeId matches that type version only. Entities of any listed type match.",
  ),
  webIds: identifiers(webIdsDescription),
  entityIds: identifiers(
    "Entity ids to read, for example ids returned by an earlier read: `webId~entityUuid`, or `webId~entityUuid~draftId` for a draft. An id with a draft part reads that draft.",
  ),
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
  fullValuesFor: identifiers(
    "Entity ids whose property values to show in full, as JSON, where the result would otherwise summarise a large value. It doesn't change which entities are read: read them by entityIds too.",
  ),
});

export type HashEntityReadInput = v.InferOutput<typeof vHashEntityReadInput>;

export const parseHashEntityReadInput = (input: unknown): HashEntityReadInput =>
  v.parse(vHashEntityReadInput, input);

export const vHashEntityTypeReadInput = v.strictObject({
  entityTypeIds: identifiers(
    `Entity types to read, each a versioned URL as an entity's entityTypeIds name it, for example from ${brunchTools.hashQueryEntities}. Those exact versions are read.`,
  ),
  webIds: identifiers(
    "Web ids whose own entity types to list. Most types live in HASH's shared webs, not the user's or their organizations'.",
  ),
});

export type HashEntityTypeReadInput = v.InferOutput<
  typeof vHashEntityTypeReadInput
>;

export const parseHashEntityTypeReadInput = (
  input: unknown,
): HashEntityTypeReadInput => v.parse(vHashEntityTypeReadInput, input);

export const vHashWebReadInput = v.strictObject({});

export const parseHashWebReadInput = (input: unknown) =>
  v.parse(vHashWebReadInput, input);

/**
 * A read whose query failed in HASH's page: the page settles the call with
 * the failure's message rather than failing it, so the model can read why.
 */
export const vHashReadFailure = v.object({ error: v.string() });

export type HashReadFailure = v.InferOutput<typeof vHashReadFailure>;

/**
 * The graph returns at most a page of matches, and the page reports
 * `truncated` when it stopped there; the reads don't fetch further pages.
 */
const vTruncated = v.optional(v.literal(true));

/** One entity as HASH's page returns it: every field comes from the same returned edition. */
const vHashEntity = v.object({
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

export const vHashEntityReadResult = v.object({
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
  entities: v.array(vHashEntity),
  truncated: vTruncated,
});

export type HashEntityReadResult = v.InferOutput<typeof vHashEntityReadResult>;

const vHashEntityType = v.object({
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

export const vHashEntityTypeReadResult = v.object({
  entityTypes: v.array(vHashEntityType),
  truncated: vTruncated,
});

export type HashEntityTypeReadResult = v.InferOutput<
  typeof vHashEntityTypeReadResult
>;

export const vHashWebReadResult = v.object({
  webs: v.array(
    v.object({
      webId: v.string(),
      kind: v.picklist(["user", "organization"]),
      shortname: v.optional(v.string()),
      name: v.optional(v.string()),
    }),
  ),
});

export type HashWebReadResult = v.InferOutput<typeof vHashWebReadResult>;
