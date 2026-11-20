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
 * The most matched entities one page of an entity read holds: the graph
 * server's default query limit for entities.
 */
export const hashEntityReadMaxLimit = 1000;

/**
 * How many matched entities a page holds when the model names no limit. Small
 * enough that a page with its properties usually fits the read's token
 * budget: at about 130 tokens an entity on the seeded supply-chain data, 100
 * come to about 13,000. Questions of how many go to the count, not to pages.
 */
export const hashEntityReadDefaultLimit = 100;

const formattedMaxLimit = hashEntityReadMaxLimit.toLocaleString("en-US");
const formattedDefaultLimit =
  hashEntityReadDefaultLimit.toLocaleString("en-US");

const limitMessage = `limit is how many matched entities one page holds: a whole number from 1 to ${formattedMaxLimit}. Omit it for ${formattedDefaultLimit}.`;

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

const propertyBaseUrlPattern = /^https?:\/\/\S+\/$/u;
const propertyTypeIdPattern = /^https?:\/\/\S+\/v\/[1-9]\d*$/u;

/**
 * The base URL of a property, named by its base URL or its versioned
 * propertyTypeId, as `hashPropertySelectorSchema` admits: an entity's
 * properties are keyed by base URL, whatever version they were saved against.
 */
export const hashPropertyBaseUrl = (property: string) =>
  propertyTypeIdPattern.test(property)
    ? property.replace(/v\/[1-9]\d*$/u, "")
    : property;

const propertySelectorMessage =
  "A property is named by its base URL, ending in /, as in https://hash.ai/@h/types/property-type/name/, or by its versioned propertyTypeId, as in …/property-type/name/v/1: copy one from an entity read's properties legend. A short name such as name holds within one read only, so it isn't accepted.";

/**
 * One property, by its base URL or its versioned propertyTypeId. A short
 * name is refused: it is only the name one read gave it.
 */
const hashPropertySelectorSchema = v.pipe(
  v.string(propertySelectorMessage),
  v.check(
    (property) =>
      propertyBaseUrlPattern.test(property) ||
      propertyTypeIdPattern.test(property),
    propertySelectorMessage,
  ),
);

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
      v.minLength(1),
      v.description(
        `Property values ${subject} must equal, each { property, value }: property is a base URL or versioned propertyTypeId, as an entity read's properties legend shows it (not a short name); value is a string, number or boolean, matched exactly, with no case folding or partial match. Give the value in the type the read showed it: a quoted value is a string, a bare one a number, and "42" doesn't match 42. Every condition must hold, along with the other filters. Use it to find a record by a value you know, such as an order number, rather than listing records to search them.`,
      ),
    ),
  );

export const hashEntityReadInputSchema = v.strictObject({
  entityTypes: identifiersSchemaWith({
    description:
      "Entity type titles to match, for example `Organization`. A title matches every type with that title, in any web and at any version; a versioned entityTypeId matches that type version only. Entities of any listed type match.",
  }),
  webIds: identifiersSchemaWith({
    description: `Web ids to read from. An entity belongs to the web of the user or organization that owns it. Omit to read only the user's own web and their organizations' webs, as ${brunchTools.hashQueryWebs} lists them; name webs to read in others, whose entities come back marked external.`,
  }),
  entityIds: identifiersSchemaWith({
    description:
      "Entity ids to read, for example ids returned by an earlier read: `webId~entityUuid`, or `webId~entityUuid~draftId` for a draft. An id with a draft part reads that draft. An id names its web, so a named entity is read wherever it is, without webIds; one outside the user's and their organizations' webs comes back marked external. Given webIds too, an entity must also be in one of them.",
  }),
  propertyEquals: propertyEqualsSchemaWith({
    subject: "a matched entity's properties",
  }),
  properties: v.optional(
    v.pipe(
      v.array(hashPropertySelectorSchema),
      v.minLength(1),
      v.description(
        "Which properties to show for each entity, each a base URL or versioned propertyTypeId, as an entity read's properties legend shows it (not a short name). Only these are shown, and only these listed in the legend; each entity's entityId, editionId, types and link endpoints are always shown. It changes only what you are shown, not which entities match, the page or its cursor: HASH still returns whole entities. A path in fullValuesFor is shown whether or not its property is chosen. Choose properties when reading many records, to keep the read small.",
      ),
    ),
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
  limit: v.optional(
    v.pipe(
      v.number(limitMessage),
      v.integer(limitMessage),
      v.minValue(1, limitMessage),
      v.maxValue(hashEntityReadMaxLimit, limitMessage),
      v.description(
        `How many matched entities one page holds, from 1 to ${formattedMaxLimit}; entities reached by following links come on top. Defaults to ${formattedDefaultLimit}. Lower it when a read is too large to show.`,
      ),
    ),
  ),
  cursor: v.optional(
    v.pipe(
      v.string(),
      v.minLength(1),
      v.description(
        "Where to continue a read that has more pages: the cursor its result gave, copied exactly. Repeat the same read with it, changing nothing but the cursor and, if the page was too large, the limit or properties; propertyEquals is part of what matches, so keep it as it was. A cursor from another read skips or repeats matches. Omit it to read the first page.",
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

/** The most link steps a count's `where` path follows. */
export const hashEntityCountMaxPathSteps = 2;

/**
 * The most entities a count by links (`where` or `groupBy`) may read, across
 * all its pages: the counted entities, the links of each type it follows and
 * the grouped entities it labels. A count that would read more is refused
 * before reading them.
 */
export const hashEntityCountMaxJoinEntities = 20_000;

/** How many groups a count by links lists, largest first, before summing the rest. */
export const hashEntityCountMaxGroups = 25;

/** How many qualifying entities a count by links gives as examples. */
export const hashEntityCountMaxExamples = 3;

const formattedMaxJoinEntities =
  hashEntityCountMaxJoinEntities.toLocaleString("en-US");

const pathStepsMessage = `A path follows ${hashEntityCountMaxPathSteps} links at most: count in two steps, or ask the user to narrow the question.`;

const joinNeedsEntityTypesMessage =
  'where and groupBy count the entities of a type by their links: name that type in entityTypes, such as ["Sales Order"].';

/** One link followed from an entity, to the entity at the link's other end. */
const hashEntityCountStepSchema = v.strictObject({
  linkType: v.pipe(
    hashEntityTypeSelectorSchema,
    v.description(
      "The link entity type to follow: a title such as `Has Customer`, or a versioned entityTypeId.",
    ),
  ),
  direction: v.pipe(
    v.picklist(["outgoing", "incoming"]),
    v.description(
      "outgoing follows links whose left (source) entity is this one to their right (target) entity; incoming follows links whose right (target) entity is this one back to their left (source) entity.",
    ),
  ),
});

export const hashEntityCountInputSchema = v.pipe(
  v.strictObject({
    entityTypes: v.optional(
      v.pipe(
        v.array(hashEntityTypeSelectorSchema),
        v.minLength(1),
        v.description(
          "Entity types to count, each a title such as `Sales Order`, matching every type with that title at any version, or a versioned entityTypeId, matching that version only. Entities of any listed type are counted. Omit to count every entity, links included; required with where or groupBy.",
        ),
      ),
    ),
    propertyEquals: propertyEqualsSchemaWith({
      subject: "a counted entity's properties",
    }),
    webIds: identifiersSchemaWith({
      description: `Web ids to count in. Omit to count in the user's own web and their organizations' webs, as ${brunchTools.hashQueryWebs} lists them; name webs to count in others. With where or groupBy, the links followed and the grouped entities are read in the same webs.`,
    }),
    where: v.optional(
      v.pipe(
        v.strictObject({
          path: v.pipe(
            v.array(hashEntityCountStepSchema),
            v.minLength(1, pathStepsMessage),
            v.maxLength(hashEntityCountMaxPathSteps, pathStepsMessage),
            v.description(
              "One or two link steps from each counted entity, each { linkType, direction }; the second step follows links from the entities the first reached.",
            ),
          ),
          exists: v.pipe(
            v.boolean(),
            v.description(
              "true counts an entity when the path reaches at least one entity; false counts it when the path reaches none.",
            ),
          ),
        }),
        v.description(
          `Count only the entities for which a path of one or two links does, or does not, reach some entity: what a filter can't say, such as "has no such link". For example, sales orders none of whose line items is fulfilled: entityTypes ["Sales Order"], path [{ linkType: "Has Line Item", direction: "outgoing" }, { linkType: "Fulfills", direction: "incoming" }], exists false. A link reaches its other end even when that entity can't be read. It reads every entity of the type and every link of each type followed, at most ${formattedMaxJoinEntities} in all.`,
        ),
      ),
    ),
    groupBy: v.optional(
      v.pipe(
        hashEntityCountStepSchema,
        v.description(
          `Group the counted entities by the entity one link away, such as each sales order's customer: { linkType: "Has Customer", direction: "outgoing" }. An entity linked to several is counted under each; one linked to none is counted under (none). Lists the ${hashEntityCountMaxGroups} largest groups and sums the rest.`,
        ),
      ),
    ),
  }),
  v.check(
    ({ entityTypes, where, groupBy }) =>
      (where === undefined && groupBy === undefined) ||
      entityTypes !== undefined,
    joinNeedsEntityTypesMessage,
  ),
);

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
 * The graph returns at most a page of types, and the page reports
 * `truncated` when it stopped there; the type read doesn't fetch further
 * pages. The entity read pages by `cursor` instead.
 */
const truncatedSchema = v.optional(v.literal(true));

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
   * where the next page starts, as the page encoded it. Opaque to the agent
   * and the model, which pass it back unchanged as the next read's `cursor`.
   * Entities reached by links may appear on more than one page; matches don't.
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

export type HashEntityCountStep = v.InferOutput<
  typeof hashEntityCountStepSchema
>;

/**
 * How many entities a count by links reads, or would read, of one kind: the
 * counted entities (`counted`, by the input's `entityTypes`), the links of one
 * type it follows (`link`, by that step's `linkType`), or the grouped entities
 * it labels (`grouped`).
 */
const hashEntityCountJoinReadSchema = v.object({
  role: v.picklist(["counted", "link", "grouped"]),
  /** The entity types read: the input's selectors, a title or versioned id each. */
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

/**
 * The result of a count by links (`where` or `groupBy`), which the page reads
 * page by page and joins itself: `counted` with the count; `refused` before
 * reading, because it would read more than `hashEntityCountMaxJoinEntities`;
 * or `incomplete`, when a read failed or the budget ran out part-way, which
 * carries no count, since what was read is not all there is.
 */
export const hashEntityCountJoinResultSchema = v.variant("outcome", [
  v.object({
    outcome: v.literal("counted"),
    webScope: v.picklist(["default", "named"]),
    /** How many entities of the counted types were read. */
    ofType: countSchema,
    /** How many of them qualified under `where`, or all of them without it. */
    count: countSchema,
    /**
     * With `groupBy`: the largest groups, most first, each by the entity one
     * step away, or with no `entity` for those linked to none.
     */
    groups: v.optional(
      v.array(
        v.object({
          entity: v.optional(hashEntityCountJoinEntitySchema),
          /** Set when the grouped entity could not be read (outside the webs counted, or hidden from the user), so has no label. */
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
    webScope: v.picklist(["default", "named"]),
    /** How many entities of each kind the count would read. */
    reads: v.array(hashEntityCountJoinReadSchema),
    requests: countSchema,
  }),
  v.object({
    outcome: v.literal("incomplete"),
    webScope: v.picklist(["default", "named"]),
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
