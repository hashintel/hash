/**
 * What the model may ask of each graph view: survey, profile, details and
 * tabular. Every field says what it accepts and how it combines, and every
 * refusal names what to change, because the model reads these schemas as the
 * views' grammar.
 */
import * as v from "valibot";

import { brunchTools } from "../../constants";
import { hashEntityReadMaxTraversalDepth } from "../graph-reads";

/** The four views, by the name the model calls each one. */
export const hashGraphViewTools = {
  survey: "hash_survey_entities",
  profile: "hash_profile_entities",
  details: "hash_read_entities",
  tabular: brunchTools.hashQueryEntities,
} as const;

/** The most entities a details read takes; more is a tabular read. */
export const hashEntityDetailsMaxEntities = 20;

const uuidGrammar = String.raw`[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}`;
const versionedUrlGrammar = String.raw`https?://\S+/v/[1-9]\d*`;

export const hashWebIdSchema = v.pipe(
  v.string(),
  v.regex(
    new RegExp(`^${uuidGrammar}$`),
    "A web id is one UUID, such as the first part of an entity id; copy it from a read.",
  ),
  v.brand("HashWebId"),
  v.description(
    "A web id: the UUID before the first ~ in an entity id, or a web from the user's own or organisation webs.",
  ),
);

export const hashEntityIdSchema = v.pipe(
  v.string(),
  v.regex(
    new RegExp(`^${uuidGrammar}~${uuidGrammar}(?:~${uuidGrammar})?$`),
    "An entity id is webId~entityUuid, or webId~entityUuid~draftId for a draft; copy it whole from a read.",
  ),
  v.brand("HashEntityId"),
  v.description(
    "An entity id exactly as a read returned it: webId~entityUuid, or webId~entityUuid~draftId for a draft. Copy it whole; never shorten or build one.",
  ),
);

export type HashEntityId = v.InferOutput<typeof hashEntityIdSchema>;

const entityTypeSelectorSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.check(
    (selector) =>
      !/^https?:\/\//u.test(selector) ||
      new RegExp(`^${versionedUrlGrammar}$`).test(selector),
    "An entity type URL needs its version, as in …/purchase-order/v/1; copy the entityTypeId from a read's legend, or give the type's title instead.",
  ),
  v.description(
    "An entity type title, such as Purchase Order, which matches every type with that title in any web and at any version; or a versioned entityTypeId from a read's legend, such as https://hash.ai/@h/types/entity-type/purchase-order/v/1, which matches that version only.",
  ),
);

const listOf = <Item extends v.GenericSchema>(
  item: Item,
  description: string,
) =>
  v.optional(v.pipe(v.array(item), v.minLength(1), v.description(description)));

const filterFields = {
  entityTypes: listOf(
    entityTypeSelectorSchema,
    "Entity types to match, each a title or a versioned entityTypeId. An entity of any listed type matches.",
  ),
  webIds: listOf(
    hashWebIdSchema,
    "Webs to read from. An entity matches when it belongs to any of them.",
  ),
  entityIds: listOf(
    hashEntityIdSchema,
    "Entities to read by id, such as ids from an earlier read or a link column.",
  ),
  includeDrafts: v.optional(
    v.pipe(
      v.boolean(),
      v.description(
        "Whether to include unpublished drafts. Defaults to false; an id with a draft part reads that draft either way.",
      ),
    ),
  ),
};

const propertiesField = listOf(
  v.pipe(v.string(), v.minLength(1)),
  "Property names to show, as an earlier read's legend names them, such as order_date. Omit to show every property. A name the read doesn't hold is reported, not guessed.",
);

export const hashEntitySurveyInputSchema = v.strictObject({
  webIds: filterFields.webIds,
  includeDrafts: filterFields.includeDrafts,
});

export type HashEntitySurveyInput = v.InferOutput<
  typeof hashEntitySurveyInputSchema
>;

export const parseHashEntitySurveyInput = v.parser(hashEntitySurveyInputSchema);

export const hashEntityProfileInputSchema = v.strictObject({
  ...filterFields,
  traversalDepth: v.optional(
    v.pipe(
      v.number(),
      v.integer(),
      v.minValue(0),
      v.maxValue(hashEntityReadMaxTraversalDepth),
      v.description(
        `How many links to follow, in either direction, to describe what the matched entities connect to: 0 to ${hashEntityReadMaxTraversalDepth}. Defaults to 1. Reached entities are counted and summarised apart from the matches.`,
      ),
    ),
  ),
});

export type HashEntityProfileInput = v.InferOutput<
  typeof hashEntityProfileInputSchema
>;

export const parseHashEntityProfileInput = v.parser(
  hashEntityProfileInputSchema,
);

export const hashEntityTabularInputSchema = v.strictObject({
  ...filterFields,
  properties: propertiesField,
  links: v.optional(
    v.pipe(
      v.boolean(),
      v.description(
        "Whether to add a column per outgoing link type, holding the ids linked to. Defaults to true.",
      ),
    ),
  ),
});

export type HashEntityTabularInput = v.InferOutput<
  typeof hashEntityTabularInputSchema
>;

export const parseHashEntityTabularInput = v.parser(
  hashEntityTabularInputSchema,
);

export const hashEntityDetailsInputSchema = v.pipe(
  v.strictObject({
    entityIds: v.pipe(
      v.array(hashEntityIdSchema),
      v.minLength(1),
      v.maxLength(
        hashEntityDetailsMaxEntities,
        (issue) =>
          `${hashGraphViewTools.details} reads at most ${hashEntityDetailsMaxEntities} entities; ${String(issue.received)} were named. Read more as rows with ${hashGraphViewTools.tabular} by their entityIds, choosing the properties you need.`,
      ),
      v.description(
        `The entities to read, at most ${hashEntityDetailsMaxEntities}, by the ids an earlier read gave.`,
      ),
    ),
    properties: propertiesField,
    fullValuesFor: listOf(
      hashEntityIdSchema,
      "Entities, also listed in entityIds, whose summarised property values to show in full.",
    ),
    includeDrafts: filterFields.includeDrafts,
  }),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const named = new Set(dataset.value.entityIds);
    const unnamed = (dataset.value.fullValuesFor ?? []).filter(
      (entityId) => !named.has(entityId),
    );
    if (unnamed.length > 0)
      addIssue({
        message: `fullValuesFor names ${unnamed.join(", ")}, which entityIds doesn't; add ${unnamed.length === 1 ? "it" : "them"} to entityIds to read ${unnamed.length === 1 ? "its" : "their"} full values.`,
      });
  }),
);

export type HashEntityDetailsInput = v.InferOutput<
  typeof hashEntityDetailsInputSchema
>;

export const parseHashEntityDetailsInput = v.parser(
  hashEntityDetailsInputSchema,
);
