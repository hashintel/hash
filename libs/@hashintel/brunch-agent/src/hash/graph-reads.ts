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
 * The most matches the graph returns for one query, entities or types: the
 * graph server's query limit. One page of an entity read, type read, or count
 * by links holds at most this many.
 */
export const hashEntityReadMaxLimit = 1000;

/**
 * How many matched entities a page holds when the model names no limit. Small
 * enough that a page with its properties usually fits the default token
 * budget: at about 130 tokens an entity on the seeded supply-chain data, 100
 * come to about 13,000. Questions of how many go to the count, not to pages.
 */
export const hashEntityReadDefaultLimit = 100;

/** How many entity types one type-read page holds when the model names no limit. */
export const hashEntityTypeReadDefaultLimit = 50;

/**
 * Default, minimum, and maximum estimated token budget for a single graph
 * read or count tool output. The ceiling stays below the runtime's durable
 * tool-output safety net while letting the agent raise the budget when needed.
 */
export const hashReadDefaultMaxTokens = 20_000;
export const hashReadMinMaxTokens = 1_000;
export const hashReadMaxMaxTokens = 60_000;

/**
 * Default and maximum entities a count by links (`where` or `groupBy`) may
 * read across its counted and link pages before refusing. The ceiling reflects
 * the graph's actor burst limit (100 requests x 1,000 entities/page).
 */
export const hashEntityCountDefaultJoinEntities = 20_000;
export const hashEntityCountMaxJoinEntities = 100_000;

/** Default and maximum groups a count by links lists before summing the rest. */
export const hashEntityCountDefaultGroups = 25;
export const hashEntityCountMaxGroups = 500;

/** Default and maximum qualifying entities a count by links lists as examples. */
export const hashEntityCountDefaultExamples = 3;
export const hashEntityCountMaxExamples = 100;

const formatInt = (value: number) => value.toLocaleString("en-US");

const formattedMaxLimit = formatInt(hashEntityReadMaxLimit);
const formattedDefaultLimit = formatInt(hashEntityReadDefaultLimit);
const formattedTypeDefaultLimit = formatInt(hashEntityTypeReadDefaultLimit);
const formattedDefaultMaxTokens = formatInt(hashReadDefaultMaxTokens);
const formattedMinMaxTokens = formatInt(hashReadMinMaxTokens);
const formattedMaxMaxTokens = formatInt(hashReadMaxMaxTokens);
const formattedDefaultJoinEntities = formatInt(
  hashEntityCountDefaultJoinEntities,
);
const formattedMaxJoinEntities = formatInt(hashEntityCountMaxJoinEntities);

const traversalDepthMessage = `traversalDepth is how many links to follow from matched entities: a whole number from 0 to ${hashEntityReadMaxTraversalDepth} (the graph caps traversal paths at depth ${hashEntityReadMaxTraversalDepth}; to go deeper, follow up by entityIds). Omit it for ${hashEntityReadDefaultTraversalDepth}.`;

const entityReadLimitMessage = `limit is how many matched entities one page holds: a whole number from 1 to ${formattedMaxLimit} (use cursor for later pages, or ${brunchTools.hashCountEntities} to count). Omit it for ${formattedDefaultLimit}.`;

const entityTypeReadLimitMessage = `limit is how many entity types one page holds: a whole number from 1 to ${formattedMaxLimit} (use cursor for later pages). Omit it for ${formattedTypeDefaultLimit}.`;

const maxTokensMessage = `maxTokens is the estimated token budget for this tool's output: a whole number from ${formattedMinMaxTokens} to ${formattedMaxMaxTokens}. Omit it for ${formattedDefaultMaxTokens}.`;

const maxGroupsMessage = `maxGroups is how many groups to list before summing the rest: a whole number from 1 to ${formatInt(hashEntityCountMaxGroups)}. Omit it for ${formatInt(hashEntityCountDefaultGroups)}.`;

const maxExamplesMessage = `maxExamples is how many qualifying entities to list as examples: a whole number from 0 to ${formatInt(hashEntityCountMaxExamples)} (0 for none). Omit it for ${formatInt(hashEntityCountDefaultExamples)}.`;

const maxJoinEntitiesMessage = `maxJoinEntities is the most entities a count by links may read across all counted and link pages: a whole number from 1 to ${formattedMaxJoinEntities}. Omit it for ${formattedDefaultJoinEntities}.`;

const maxTokensSchema = v.optional(
  v.pipe(
    v.number(maxTokensMessage),
    v.integer(maxTokensMessage),
    v.minValue(hashReadMinMaxTokens, maxTokensMessage),
    v.maxValue(hashReadMaxMaxTokens, maxTokensMessage),
    v.description(
      `Estimated token budget for this tool's output, from ${formattedMinMaxTokens} to ${formattedMaxMaxTokens}. Defaults to ${formattedDefaultMaxTokens}; raise it if a narrowed read still exceeds the budget.`,
    ),
  ),
);

/**
 * List length and id length are deliberately unbounded: the page reads as the
 * signed-in user, and the graph enforces its own limits.
 */
const identifiersSchemaWith = ({
  name,
  description,
}: {
  name: string;
  description: string;
}) =>
  v.optional(
    v.pipe(
      v.array(
        v.pipe(
          v.string(),
          v.minLength(1, `Each entry in ${name} must be a non-empty string.`),
        ),
      ),
      v.minLength(1, `${name} cannot be empty; omit it instead.`),
      v.description(description),
    ),
  );

const baseUrlPattern = /^https?:\/\/\S+\/$/u;
const publishedVersionedUrlPattern = /^https?:\/\/\S+\/v\/[1-9]\d*$/u;
const propertyTypeIdPattern =
  /^https?:\/\/\S+\/v\/[1-9]\d*(?:-draft\.[^\s/]+\.[1-9]\d*)?$/u;

/**
 * The base URL of a property, named by its base URL or its versioned
 * propertyTypeId (published or draft), as `hashPropertySelectorSchema` admits:
 * an entity's properties are keyed by base URL in JSONB, whatever version they
 * were saved against.
 */
export const hashPropertyBaseUrl = (property: string) =>
  propertyTypeIdPattern.test(property)
    ? property.replace(/v\/[1-9]\d*(?:-draft\.[^\s/]+\.[1-9]\d*)?$/u, "")
    : property;

const entityTypeSelectorMessage =
  "An entity type URL must be a base URL ending in / (matching all versions, as in …/sales-order/) or a published versioned URL (as in …/sales-order/v/1); pre-release draft type URLs aren't supported in type filters. Copy an entityTypeId from a read, use its base URL, or give the type's title instead.";

/**
 * One entity type to filter or follow: a title, a base URL (matching all
 * versions of that type), or a published versioned URL (matching that version
 * only). Pre-release draft type URLs are refused because Postgres
 * `OntologyTypeVersion::to_sql` does not support draft versions (BE-161).
 */
const hashEntityTypeSelectorSchema = v.pipe(
  v.string(),
  v.minLength(1, "Each entity type selector must be a non-empty string."),
  v.check(
    (selector) =>
      !/^https?:\/\//u.test(selector) ||
      baseUrlPattern.test(selector) ||
      publishedVersionedUrlPattern.test(selector),
    entityTypeSelectorMessage,
  ),
);

const entityTypeIdSelectorMessage =
  "Each entry in entityTypeIds must be an entity type base URL ending in / (as in …/sales-order/) or a published versioned URL (as in …/sales-order/v/1); pre-release draft type URLs aren't supported in type filters. To match by name, pass titles instead.";

/** One entity type URL for `hash_query_entity_types`: base URL or published versioned URL. */
const hashEntityTypeIdSelectorSchema = v.pipe(
  v.string(entityTypeIdSelectorMessage),
  v.check(
    (selector) =>
      baseUrlPattern.test(selector) ||
      publishedVersionedUrlPattern.test(selector),
    entityTypeIdSelectorMessage,
  ),
);

const propertySelectorMessage =
  "A property is named by its base URL, ending in /, as in https://hash.ai/@h/types/property-type/name/, or by its versioned propertyTypeId, as in …/property-type/name/v/1: copy one from an entity read's properties legend or an entity type read. A short name such as name holds within one read only, so it isn't accepted.";

/**
 * One property, by its base URL or its versioned propertyTypeId (published or
 * draft). A short name is refused: it is only the name one read gave it.
 */
const hashPropertySelectorSchema = v.pipe(
  v.string(propertySelectorMessage),
  v.check(
    (property) =>
      baseUrlPattern.test(property) || propertyTypeIdPattern.test(property),
    propertySelectorMessage,
  ),
);

/**
 * `propertyEquals.value` is intentionally limited to primitives (`string |
 * number | boolean`): in the graph store's untagged `Parameter` enum,
 * `Vector(Embedding)` (`Vec<f32>`) is deserialized before `Any(PropertyValue)`,
 * so numeric arrays would be coerced to float32 vectors instead of JSON values.
 */
const propertyValueMessage =
  "value is the property's value to match exactly: a string, number or boolean, in the type the read showed it (a quoted value is a string, a bare one a number).";

const propertyEqualsSchemaWith = ({ subject }: { subject: string }) =>
  v.optional(
    v.pipe(
      v.array(
        v.strictObject({
          property: hashPropertySelectorSchema,
          value: v.union(
            [v.string(), v.number(), v.boolean()],
            propertyValueMessage,
          ),
        }),
      ),
      v.minLength(1, "propertyEquals cannot be empty; omit it instead."),
      v.description(
        `Property values ${subject} must equal, each { property, value }: property is a base URL or versioned propertyTypeId (not a short name); value is a string, number or boolean (arrays and objects are not filterable by exact equality), matched with no case folding or partial match, and only in the type it is stored as: "42" doesn't match 42. Every condition must hold, along with the other filters.`,
      ),
    ),
  );

const offsetMessage = "offset must be a whole number >= 0.";
const pathLimitMessage = "limit must be a whole number >= 1.";

export const hashEntityReadInputSchema = v.strictObject({
  entityTypes: v.optional(
    v.pipe(
      v.array(hashEntityTypeSelectorSchema),
      v.minLength(1, "entityTypes cannot be empty; omit it instead."),
      v.description(
        "Entity types to match: a title such as `Organization` (matches every type with that title in any web and at any version), a type base URL ending in `/` (matches all versions of that type), or a published versioned entityTypeId (matches that version only). Entities of any listed type match.",
      ),
    ),
  ),
  webIds: identifiersSchemaWith({
    name: "webIds",
    description: `Web ids to read from, each the web of a user or organization. Omit for the user's own web and their organizations' webs, as ${brunchTools.hashQueryWebs} lists them.`,
  }),
  entityIds: identifiersSchemaWith({
    name: "entityIds",
    description:
      "Entity ids to read, as earlier reads gave them: `webId~entityUuid`, or `webId~entityUuid~draftId`, which reads that draft. Each is read in the web it names; given webIds too, an entity must also be in one of them.",
  }),
  propertyEquals: propertyEqualsSchemaWith({
    subject: "a matched entity's properties",
  }),
  properties: v.optional(
    v.pipe(
      v.array(hashPropertySelectorSchema),
      v.minLength(1, "properties cannot be empty; omit it instead."),
      v.description(
        "Which properties to show for each entity, each a base URL or versioned propertyTypeId (not a short name). Only these (plus any property targeted by fullValuesFor) are returned and listed in the legend; each entity's entityId, editionId, types and link endpoints are always shown.",
      ),
    ),
  ),
  traversalDepth: v.optional(
    v.pipe(
      v.number(traversalDepthMessage),
      v.integer(traversalDepthMessage),
      v.minValue(0, traversalDepthMessage),
      v.maxValue(hashEntityReadMaxTraversalDepth, traversalDepthMessage),
      v.description(
        `How many links to follow from the matched entities, from 0 to ${hashEntityReadMaxTraversalDepth} (graph cap; follow up by entityIds to go deeper). Each link is followed in either direction, so mixed chains such as A → B ← C are included; a matched link entity's own endpoints are included too. 0 returns only the matches. Defaults to ${hashEntityReadDefaultTraversalDepth}.`,
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
  includeArchived: v.optional(
    v.pipe(
      v.boolean(),
      v.description(
        "Whether to include archived entities. Defaults to false (both metadata-archived entities and entities with archived: true are excluded from matches and traversed links).",
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
              v.minLength(
                1,
                "A fullValuesFor path needs at least one step: the property name (short name, base URL, or versioned propertyTypeId), then any nested keys or array indices.",
              ),
              v.description(
                'Where the part is: the property\'s name as the read shows it (or its base URL or versioned propertyTypeId), then the keys or array positions inside its value, for example ["definition_object", "parameters"] or ["definition_object", "places", "0"].',
              ),
            ),
            offset: v.optional(
              v.pipe(
                v.number(offsetMessage),
                v.integer(offsetMessage),
                v.minValue(0, offsetMessage),
                v.description(
                  "Starting character index for a string value, or starting element/key index for an outlined array or object. Defaults to 0.",
                ),
              ),
            ),
            limit: v.optional(
              v.pipe(
                v.number(pathLimitMessage),
                v.integer(pathLimitMessage),
                v.minValue(1, pathLimitMessage),
                v.description(
                  "Maximum characters to return from a string value, or maximum entries from an outlined array or object. Omit to show up to the output token budget.",
                ),
              ),
            ),
          }),
        ]),
      ),
      v.minLength(1, "fullValuesFor cannot be empty; omit it instead."),
      v.description(
        "Values to show where the read would otherwise summarise them (> 500 B): an entity id for all that entity's values, or { entityId, path, offset?, limit? } for one value or a slice of one. Neither changes which entities are read: read them by entityIds too.",
      ),
    ),
  ),
  limit: v.optional(
    v.pipe(
      v.number(entityReadLimitMessage),
      v.integer(entityReadLimitMessage),
      v.minValue(1, entityReadLimitMessage),
      v.maxValue(hashEntityReadMaxLimit, entityReadLimitMessage),
      v.description(
        `How many matched entities one page holds, from 1 to ${formattedMaxLimit}; entities reached by following links come on top. Defaults to ${formattedDefaultLimit}.`,
      ),
    ),
  ),
  cursor: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The cursor a full page gave, copied exactly, to read the next page of the same read at the same snapshot time; a cursor from another read skips or repeats matches. Omit it to read the first page.",
      ),
    ),
  ),
  maxTokens: maxTokensSchema,
});

export type HashEntityReadInput = v.InferOutput<
  typeof hashEntityReadInputSchema
>;

export const parseHashEntityReadInput = (input: unknown): HashEntityReadInput =>
  v.parse(hashEntityReadInputSchema, input);

export const hashEntityTypeReadInputSchema = v.strictObject({
  entityTypeIds: v.optional(
    v.pipe(
      v.array(hashEntityTypeIdSelectorSchema),
      v.minLength(1, "entityTypeIds cannot be empty; omit it instead."),
      v.description(
        `Entity types to read by URL: a published versioned URL (for example from ${brunchTools.hashQueryEntities}) reads that exact version, or a base URL ending in \`/\` reads its latest version (or all matching versions when paired with exact versioned URLs).`,
      ),
    ),
  ),
  titles: identifiersSchemaWith({
    name: "titles",
    description:
      "Entity type titles to match, for example `Sales Order`. Matches the latest version of every entity type with a listed title.",
  }),
  webIds: identifiersSchemaWith({
    name: "webIds",
    description:
      "Web ids whose own entity types to list. Most types live in HASH's shared webs, not the user's or their organizations'.",
  }),
  limit: v.optional(
    v.pipe(
      v.number(entityTypeReadLimitMessage),
      v.integer(entityTypeReadLimitMessage),
      v.minValue(1, entityTypeReadLimitMessage),
      v.maxValue(hashEntityReadMaxLimit, entityTypeReadLimitMessage),
      v.description(
        `How many entity types one page holds, from 1 to ${formattedMaxLimit}. Defaults to ${formattedTypeDefaultLimit}.`,
      ),
    ),
  ),
  cursor: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "The cursor a full type-read page gave, copied exactly, to read the next page. Omit it to read the first page.",
      ),
    ),
  ),
  maxTokens: maxTokensSchema,
});

export type HashEntityTypeReadInput = v.InferOutput<
  typeof hashEntityTypeReadInputSchema
>;

export const parseHashEntityTypeReadInput = (
  input: unknown,
): HashEntityTypeReadInput => v.parse(hashEntityTypeReadInputSchema, input);

const emptyPathMessage =
  "A where path needs at least one link step, each { linkType, direction }.";

const emptyGroupByPathMessage =
  "A groupBy path needs at least one link step, each { linkType, direction }.";

/** One link followed from an entity, to the entity at the link's other end. */
const hashEntityCountStepSchema = v.strictObject({
  linkType: v.pipe(
    hashEntityTypeSelectorSchema,
    v.description(
      "The link entity type to follow: a title such as `Has Customer`, a type base URL ending in `/`, or a published versioned entityTypeId.",
    ),
  ),
  direction: v.pipe(
    v.picklist(["outgoing", "incoming"]),
    v.description(
      "outgoing follows links whose left (source) entity is this one to their right (target) entity; incoming follows links whose right (target) entity is this one back to their left (source) entity.",
    ),
  ),
});

export type HashEntityCountStep = v.InferOutput<
  typeof hashEntityCountStepSchema
>;

const hashEntityCountWhereConditionSchema = v.strictObject({
  path: v.pipe(
    v.array(hashEntityCountStepSchema),
    v.minLength(1, emptyPathMessage),
    v.description(
      "One or more link steps from each counted entity, each { linkType, direction }; each later step follows links from the entities the previous step reached.",
    ),
  ),
  exists: v.pipe(
    v.boolean(),
    v.description(
      "true counts an entity when the path reaches at least one entity; false counts it when the path reaches none.",
    ),
  ),
});

export type HashEntityCountWhereCondition = v.InferOutput<
  typeof hashEntityCountWhereConditionSchema
>;

const hashEntityCountGroupBySchema = v.union([
  hashEntityCountStepSchema,
  v.strictObject({
    path: v.pipe(
      v.array(hashEntityCountStepSchema),
      v.minLength(1, emptyGroupByPathMessage),
      v.description(
        "One or more link steps from each qualifying entity to the entity to group by.",
      ),
    ),
  }),
]);

export const hashEntityCountInputSchema = v.strictObject({
  entityTypes: v.optional(
    v.pipe(
      v.array(hashEntityTypeSelectorSchema),
      v.minLength(1, "entityTypes cannot be empty; omit it instead."),
      v.description(
        "Entity types to count: a title such as `Sales Order` (matches every type with that title at any version), a type base URL ending in `/` (matches all versions of that type), or a published versioned entityTypeId (matches that version only). Entities of any listed type are counted. Omit to count every entity, links included.",
      ),
    ),
  ),
  propertyEquals: propertyEqualsSchemaWith({
    subject: "a counted entity's properties",
  }),
  webIds: identifiersSchemaWith({
    name: "webIds",
    description: `Web ids to count in. Omit for the user's own web and their organizations' webs, as ${brunchTools.hashQueryWebs} lists them. With where or groupBy, the links followed are read in the same webs; the grouped entities are read by id, in whichever web each is.`,
  }),
  includeDrafts: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Whether to include draft entities. Defaults to false."),
    ),
  ),
  includeArchived: v.optional(
    v.pipe(
      v.boolean(),
      v.description("Whether to include archived entities. Defaults to false."),
    ),
  ),
  where: v.optional(
    v.pipe(
      v.union([
        hashEntityCountWhereConditionSchema,
        v.pipe(
          v.array(hashEntityCountWhereConditionSchema),
          v.minLength(1, "where cannot be empty; omit it instead."),
        ),
      ]),
      v.description(
        "Count only the entities for which a path of links (or every condition in a list of paths) does, or does not, reach some entity. A link reaches its other end even when that entity can't be read.",
      ),
    ),
  ),
  groupBy: v.optional(
    v.pipe(
      hashEntityCountGroupBySchema,
      v.description(
        'Group the qualifying entities by the entity reached along one link step ({ linkType: "Has Customer", direction: "outgoing" }) or a multi-step { path: [...] }.',
      ),
    ),
  ),
  maxGroups: v.optional(
    v.pipe(
      v.number(maxGroupsMessage),
      v.integer(maxGroupsMessage),
      v.minValue(1, maxGroupsMessage),
      v.maxValue(hashEntityCountMaxGroups, maxGroupsMessage),
      v.description(
        `How many largest groups to list before summing the rest, from 1 to ${formatInt(hashEntityCountMaxGroups)}. Defaults to ${formatInt(hashEntityCountDefaultGroups)}.`,
      ),
    ),
  ),
  maxExamples: v.optional(
    v.pipe(
      v.number(maxExamplesMessage),
      v.integer(maxExamplesMessage),
      v.minValue(0, maxExamplesMessage),
      v.maxValue(hashEntityCountMaxExamples, maxExamplesMessage),
      v.description(
        `How many qualifying entities to list as examples, from 0 to ${formatInt(hashEntityCountMaxExamples)} (0 for none). Defaults to ${formatInt(hashEntityCountDefaultExamples)}.`,
      ),
    ),
  ),
  maxJoinEntities: v.optional(
    v.pipe(
      v.number(maxJoinEntitiesMessage),
      v.integer(maxJoinEntitiesMessage),
      v.minValue(1, maxJoinEntitiesMessage),
      v.maxValue(hashEntityCountMaxJoinEntities, maxJoinEntitiesMessage),
      v.description(
        `Maximum counted and link entities a count by links may read across all pages before refusing, from 1 to ${formattedMaxJoinEntities}. Defaults to ${formattedDefaultJoinEntities}.`,
      ),
    ),
  ),
  maxTokens: maxTokensSchema,
});

export type HashEntityCountInput = v.InferOutput<
  typeof hashEntityCountInputSchema
>;

export const parseHashEntityCountInput = (
  input: unknown,
): HashEntityCountInput => v.parse(hashEntityCountInputSchema, input);

/** Normalizes single or multi-condition `where` into a condition array. */
export const hashEntityCountWhereConditions = (
  where: HashEntityCountInput["where"],
): readonly HashEntityCountWhereCondition[] =>
  where === undefined ? [] : Array.isArray(where) ? where : [where];

/** Normalizes a single-step or multi-step `groupBy` into its ordered steps. */
export const hashEntityCountGroupByPath = (
  groupBy: HashEntityCountInput["groupBy"],
): readonly HashEntityCountStep[] =>
  groupBy === undefined ? [] : "path" in groupBy ? groupBy.path : [groupBy];

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
 * Which webs a read or count covered: the user's own and organization webs
 * when the input named none (`default`), else the webs it named (`named`).
 */
export const hashWebScopeSchema = v.picklist(["default", "named"]);

export type HashWebScope = v.InferOutput<typeof hashWebScopeSchema>;

const countSchema = v.pipe(v.number(), v.integer(), v.minValue(0));

/**
 * Settled by HASH's page when an entity read's serialized payload would exceed
 * the browser-to-agent transport ceiling, so the model receives a refusal
 * instead of an HTTP 413 transport failure.
 */
export const hashEntityReadOversizedSchema = v.object({
  refused: v.literal(true),
  payloadBytes: countSchema,
  matched: countSchema,
  linked: countSchema,
});

export type HashEntityReadOversized = v.InferOutput<
  typeof hashEntityReadOversizedSchema
>;

/** One entity as HASH's page returns it: every field comes from the same returned edition. */
const hashEntitySchema = v.object({
  entityId: v.string(),
  /** The entity's name as HASH labels it, where it has one. */
  label: v.optional(v.string()),
  editionId: v.string(),
  webId: v.string(),
  /**
   * Set when the entity's web is neither the user's own nor one of their
   * organizations', however it was reached; the page decides, since it knows
   * the user's webs. Absent from pages that predate it.
   */
  external: v.optional(v.literal(true)),
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
  /**
   * Set when the page holds as many matches as its limit, so more may match:
   * where the next page starts, as the page encoded it (including page 1's
   * resolved snapshot time). Opaque to the agent and the model, which pass it
   * back unchanged as the next read's `cursor`.
   */
  cursor: v.optional(v.pipe(v.string(), v.minLength(1))),
});

export type HashEntityReadResult = v.InferOutput<
  typeof hashEntityReadResultSchema
>;

const hashEntityTypeSchema = v.object({
  entityTypeId: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  properties: v.array(
    v.object({
      baseUrl: v.string(),
      title: v.optional(v.string()),
      description: v.optional(v.string()),
    }),
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
  cursor: v.optional(v.pipe(v.string(), v.minLength(1))),
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

/**
 * An exact count of the entities a count's filters match that the signed-in
 * user may see, by each entity's direct types and by web; it lists none.
 */
export const hashEntityCountResultSchema = v.object({
  count: countSchema,
  webScope: hashWebScopeSchema,
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

/**
 * How many entities a count by links reads, or would read, of one kind: the
 * counted entities (`counted`), the links of one type it follows (`link`), or
 * the displayed grouped entities it labels (`grouped`).
 */
const hashEntityCountJoinReadSchema = v.object({
  role: v.picklist(["counted", "link", "grouped"]),
  /** The entity types read: the input's selectors (empty for untyped counted reads or grouped id reads). */
  entityTypes: v.array(v.string()),
  entities: countSchema,
});

/**
 * A qualifying entity, or a grouped one, as a count by links names it: by id,
 * with its label where it has one, marked `external` when it is in neither the
 * user's own web nor one of their organizations'.
 */
const hashEntityCountJoinEntitySchema = v.object({
  entityId: v.string(),
  label: v.optional(v.string()),
  external: v.optional(v.literal(true)),
});

export type HashEntityCountJoinEntity = v.InferOutput<
  typeof hashEntityCountJoinEntitySchema
>;

/**
 * The result of a count by links (`where` or `groupBy`), which the page reads
 * page by page and joins itself: `counted` with the count; `refused` before
 * reading, because the counted and link entities exceed the effective
 * `maxJoinEntities` limit; or `incomplete`, when a read failed or the budget
 * ran out part-way, which carries no count.
 */
export const hashEntityCountJoinResultSchema = v.variant("outcome", [
  v.object({
    outcome: v.literal("counted"),
    webScope: hashWebScopeSchema,
    /** How many counted entities were read before applying `where`. */
    ofType: countSchema,
    /** How many of them qualified under `where`, or all of them without it. */
    count: countSchema,
    /**
     * With `groupBy`: the largest groups, most first, each by the reached
     * group entity, or with no `entity` for those linked to none.
     */
    groups: v.optional(
      v.array(
        v.object({
          entity: v.optional(hashEntityCountJoinEntitySchema),
          /** Set when the grouped entity could not be read by its id (hidden from the user, archived, or a draft), so has no label. */
          unread: v.optional(v.literal(true)),
          count: countSchema,
        }),
      ),
    ),
    /** The groups past those listed: how many, and their counts summed. */
    otherGroups: v.optional(
      v.object({ groups: countSchema, count: countSchema }),
    ),
    examples: v.array(hashEntityCountJoinEntitySchema),
    reads: v.array(hashEntityCountJoinReadSchema),
    requests: countSchema,
  }),
  v.object({
    outcome: v.literal("refused"),
    /** How many counted and link entities the count would read. */
    reads: v.array(hashEntityCountJoinReadSchema),
    requests: countSchema,
  }),
  v.object({
    outcome: v.literal("incomplete"),
    /** What stopped it, as a sentence. */
    reason: v.string(),
    /** What had been read when it stopped. */
    reads: v.array(hashEntityCountJoinReadSchema),
    requests: countSchema,
  }),
]);

export type HashEntityCountJoinResult = v.InferOutput<
  typeof hashEntityCountJoinResultSchema
>;
