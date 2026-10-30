import { z } from "zod";

import { isEntityId, validateVersionedUrl } from "@blockprotocol/type-system";

import { isIsoDate, parseDateTime } from "./datetime.js";
import {
  allPayloadKinds,
  isStoredPayloadRef,
  storedArrayPayloadKinds,
  storedPayloadKinds,
  textFormats,
} from "./types.js";

import type { ConditionNode } from "./filter-condition.js";
import type {
  EntityQuery,
  PayloadKind,
  PayloadKindValues,
  StoredConcatRef,
  StoredItemRef,
  StoredObjectRef,
  StoredPayloadRef,
} from "./types.js";
import type {
  BaseUrl,
  EntityId,
  PropertyObject,
  PropertyObjectMetadata,
  PropertyObjectWithMetadata,
  PropertyPath,
  PropertyWithMetadata,
  ProvidedEntityEditionProvenance,
  Url,
  VersionedUrl,
} from "@blockprotocol/type-system";

/**
 * Types a schema as checking `T` where zod can't infer it: a branded string, which a refinement checks, or a value
 * whose schema checks only its shape.
 */
const typed = <T>(schema: z.ZodType): z.ZodType<T> => schema as z.ZodType<T>;

const entityIdSchema = typed<EntityId>(
  z.string().refine(isEntityId, { message: "Expected an entity id" }),
);

const versionedUrlSchema = typed<VersionedUrl>(
  z.string().refine((value) => validateVersionedUrl(value).type === "Ok", {
    message: "Expected a versioned URL",
  }),
);

/** A JSON object whose contents aren't checked here. */
const objectSchema = z.record(z.string(), z.unknown());

/** A graph-owned object, typed as what the graph checks it is when an action uses it. */
const graphObject = <T>() => typed<T>(objectSchema);

const baseUrlSchema = typed<BaseUrl>(z.string());

const urlSchema = typed<Url>(z.string());

const propertyPathSchema = typed<PropertyPath>(
  z.array(z.union([z.string(), z.int().nonnegative()])),
);

const entityOperationSchema = z.enum([
  "create",
  "update",
  "already-exists-as-proposed",
]);

/**
 * The id a proposed entity is known by until it's persisted. An AI action makes it an entity id, but an integration
 * may use any unique string, e.g. the aviation actions use a flight's primary key, `flight-BA123-2026-10-28`.
 */
const localEntityIdSchema = typed<EntityId>(z.string());

const localOrExistingEntityIdSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("proposed-entity"),
    localId: localEntityIdSchema,
  }),
  z.object({
    kind: z.literal("existing-entity"),
    entityId: entityIdSchema,
  }),
]);

const proposedEntityShape = {
  claims: z.object({
    isSubjectOf: z.array(entityIdSchema),
    isObjectOf: z.array(entityIdSchema),
  }),
  provenance: graphObject<ProvidedEntityEditionProvenance>(),
  propertyMetadata: graphObject<PropertyObjectMetadata>(),
  localEntityId: localEntityIdSchema,
  entityTypeIds: typed<[VersionedUrl, ...VersionedUrl[]]>(
    z.array(versionedUrlSchema).min(1),
  ),
  summary: z.string().optional(),
  properties: graphObject<PropertyObject>(),
  sourceEntityId: localOrExistingEntityIdSchema.optional(),
  targetEntityId: localOrExistingEntityIdSchema.optional(),
};

const proposedEntityWithResolvedLinksSchema = z.object({
  ...proposedEntityShape,
  linkData: z
    .object({ leftEntityId: entityIdSchema, rightEntityId: entityIdSchema })
    .optional(),
});

const payloadKindSchema = z.enum(allPayloadKinds);

/*
 * Which subjects an item can have, which operators a subject's kind supports, and the limits on a condition's size
 * depend on the kind of the items it's applied to, so `validateSubject`, `validateCondition`, `validateSortKey` and
 * `validateAggregation` check them where that kind is known.
 */
const valueSubjectSchemas = [
  z.object({ kind: z.literal("input"), payloadKind: payloadKindSchema }),
  z.object({
    kind: z.literal("field"),
    path: z.array(z.string()),
    payloadKind: payloadKindSchema,
  }),
  z.object({
    kind: z.literal("entityProperty"),
    propertyTypeBaseUrl: baseUrlSchema,
    payloadKind: payloadKindSchema,
  }),
] as const;

const valueSubjectSchema = z.discriminatedUnion("kind", valueSubjectSchemas);

const conditionSubjectSchema = z.discriminatedUnion("kind", [
  ...valueSubjectSchemas,
  z.object({ kind: z.literal("entityType") }),
]);

const conditionGroupsOf = (conditionNode: z.ZodType<ConditionNode>) =>
  [
    z.object({
      kind: z.literal("all"),
      conditions: z.array(conditionNode).min(1),
    }),
    z.object({
      kind: z.literal("any"),
      conditions: z.array(conditionNode).min(1),
    }),
  ] as const;

/** A condition node's shape: whether its operator and value suit its subject is checked by `validateCondition`. */
const conditionNodeSchema: z.ZodType<ConditionNode> = typed<ConditionNode>(
  z.lazy(() =>
    z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("condition"),
        subject: conditionSubjectSchema,
        operator: z.string(),
        value: z
          .object({
            kind: z.union([payloadKindSchema, z.literal("BaseUrl")]),
            value: z.unknown(),
          })
          .optional(),
        includeSubtypes: z.boolean().optional(),
      }),
      ...conditionGroupsOf(conditionNodeSchema),
      z.object({ kind: z.literal("not"), condition: conditionNodeSchema }),
    ]),
  ),
);

/**
 * The schema of each payload kind's values. Adding a kind to `PayloadKindValues` without a schema here fails to
 * compile.
 *
 * Kinds defined by flows are checked in full, except for what a condition, sort key or aggregation may refer to. Kinds
 * that hold the graph's own structures (entity queries, properties and their metadata, and proposed entities) are
 * checked only down to those structures: the graph checks them in full when an action uses them.
 *
 * An object may have fields its kind doesn't define, as TypeScript allows, e.g. a web search result's position.
 *
 * A stored kind's schema checks the value itself, not a stored reference to it (see `validatePayloadValue`).
 */
export const payloadKindSchemas = {
  ActorType: z.enum(["user", "machine"]),
  Aggregation: z.discriminatedUnion("operation", [
    z.object({ operation: z.literal("count") }),
    z.object({
      operation: z.enum(["sum", "average", "min", "max"]),
      subject: valueSubjectSchema,
    }),
  ]),
  Boolean: z.boolean(),
  Date: z.string().refine(isIsoDate, {
    message: "Expected an ISO calendar date (YYYY-MM-DD)",
  }),
  DateTime: z
    .string()
    .refine((value) => typeof parseDateTime(value) === "number", {
      message:
        'Expected an ISO 8601 date and time with Z or an offset, e.g. "2026-10-16T14:00:00Z"',
    }),
  Duration: z.object({
    amount: z.number(),
    unit: z.enum(["seconds", "minutes", "hours", "days", "weeks"]),
  }),
  EntityId: entityIdSchema,
  EntityQuery: z.object({
    filter: graphObject<EntityQuery["filter"]>(),
    includeDrafts: z.boolean().optional(),
    limit: z.int().nonnegative().optional(),
    sortingPaths: z
      .array(graphObject<NonNullable<EntityQuery["sortingPaths"]>[number]>())
      .optional(),
    temporalAxes:
      graphObject<NonNullable<EntityQuery["temporalAxes"]>>().optional(),
  }),
  FailedEntityProposal: z.object({
    existingEntityId: entityIdSchema.optional(),
    operation: entityOperationSchema.optional(),
    proposedEntity: proposedEntityWithResolvedLinksSchema,
    message: z.string(),
  }),
  FilterCondition: z.discriminatedUnion(
    "kind",
    conditionGroupsOf(conditionNodeSchema),
  ),
  FormattedText: z.object({
    content: z.string(),
    format: z.enum(textFormats),
  }),
  GoogleAccountId: z.string(),
  GoogleSheet: z.union(
    [
      z.object({
        spreadsheetId: z.string(),
        newSheetName: z.string().optional(),
      }),
      z.object({
        newSheetName: z.string(),
        spreadsheetId: z.string().optional(),
      }),
    ],
    { error: "Expected either a spreadsheetId or a newSheetName" },
  ),
  Number: z.number(),
  PersistedEntityMetadata: z.object({
    entityId: entityIdSchema,
    operation: entityOperationSchema,
  }),
  PropertyObjectWithMetadata: z.object({
    value: z.record(baseUrlSchema, graphObject<PropertyWithMetadata>()),
    metadata:
      graphObject<
        NonNullable<PropertyObjectWithMetadata["metadata"]>
      >().optional(),
  }),
  PropertyPatch: z.discriminatedUnion("op", [
    z.object({
      op: z.literal("add"),
      path: propertyPathSchema,
      property: graphObject<PropertyWithMetadata>(),
    }),
    z.object({
      op: z.literal("replace"),
      path: propertyPathSchema,
      property: graphObject<PropertyWithMetadata>(),
    }),
    z.object({ op: z.literal("remove"), path: propertyPathSchema }),
  ]),
  ProposedEntity: z.object(proposedEntityShape),
  ProposedEntityWithResolvedLinks: proposedEntityWithResolvedLinksSchema,
  SortKey: z.object({
    subject: valueSubjectSchema,
    direction: z.enum(["ascending", "descending"]),
  }),
  Text: z.string(),
  VersionedUrl: versionedUrlSchema,
  WebPage: z.object({
    url: urlSchema,
    title: z.string(),
    htmlContent: z.string(),
    innerText: z.string(),
  }),
  WebSearchResult: z.object({ url: urlSchema, title: z.string() }),
} satisfies {
  [Kind in PayloadKind]: z.ZodType<PayloadKindValues[Kind]>;
};

const identifierPattern = /^[A-Za-z_$][\w$]*$/;

/** Formats a path into a value, e.g. `[2].properties["https://hash.ai/@h/types/property-type/name/"]`. */
export const formatPayloadPath = (path: readonly PropertyKey[]): string =>
  path
    .map((segment, index) => {
      if (typeof segment === "number") {
        return `[${segment}]`;
      }
      // nosemgrep: ajinabraham.njsscan.dos.regex_dos.regex_dos
      if (typeof segment === "string" && identifierPattern.test(segment)) {
        return index === 0 ? segment : `.${segment}`;
      }
      return `[${JSON.stringify(String(segment))}]`;
    })
    .join("");

/** The first thing wrong with a payload value: where it is, as a path into the value (`""` for the value itself), and what's wrong. */
export type PayloadValueProblem = { path: string; message: string };

/** A problem as the end of a sentence about the value it's in, e.g. ` at [1].name: Expected a string`. */
export const describePayloadValueProblem = ({
  path,
  message,
}: PayloadValueProblem) => (path ? ` at ${path}: ${message}` : `: ${message}`);

const englishErrorMap = z.locales.en().localeError;

const firstProblem = (
  schema: z.ZodType,
  value: unknown,
  path: PropertyKey[],
): PayloadValueProblem | undefined => {
  const result = schema.safeParse(value, {
    /*
     * zod sets its English messages as a side effect of being imported, which bundlers drop (it declares no side
     * effects), e.g. in Temporal's workflow bundle, leaving only "Invalid input".
     */
    error: englishErrorMap,
  });
  const [issue] = result.error?.issues ?? [];

  return issue
    ? {
        path: formatPayloadPath([...path, ...issue.path]),
        message: issue.message,
      }
    : undefined;
};

const storableKinds = [
  ...storedPayloadKinds,
  ...storedArrayPayloadKinds,
] as const;

/** A number of items, or an item's position among them. */
const itemCountSchema = z.int().nonnegative();

const storedRefShape = {
  __stored: z.literal(true),
  kind: z.enum(storableKinds),
};

/**
 * Strict, as it's also a concatenation's part and an item's array, which aren't picked by shape: storage would resolve
 * one with a `parts` or `of` field as that shape, ignoring its storage key.
 */
const storedArrayObjectRefSchema = z.strictObject({
  ...storedRefShape,
  storageKey: z.string(),
  array: z.literal(true),
  length: itemCountSchema,
});

/**
 * The schema of each shape of stored payload reference (see `StoredPayloadRef`). Each shape has a field no other has,
 * which `getStoredRefShape` picks it by, so that a problem is reported against the reference's own shape.
 *
 * A new shape, e.g. for a selection of a stored array's items, is added here and to `getStoredRefShape`.
 */
const storedRefSchemas = {
  object: z.discriminatedUnion("array", [
    z.object({
      ...storedRefShape,
      storageKey: z.string(),
      array: z.literal(false),
    }),
    storedArrayObjectRefSchema,
  ]),
  item: z
    .object({
      ...storedRefShape,
      array: z.literal(false),
      of: storedArrayObjectRefSchema,
      index: itemCountSchema,
    })
    .refine(({ kind, of }) => of.kind === kind, {
      path: ["of", "kind"],
      message: "Expected the array an item is in to be of the item's kind",
    })
    .refine(({ index, of }) => index < of.length, {
      path: ["index"],
      message: "Expected an index within the array's length",
    }),
  concat: z
    .object({
      ...storedRefShape,
      array: z.literal(true),
      parts: z.array(storedArrayObjectRefSchema),
      length: itemCountSchema,
    })
    .superRefine(({ kind, parts, length }, context) => {
      const partIndex = parts.findIndex((part) => part.kind !== kind);

      if (partIndex !== -1) {
        context.addIssue({
          code: "custom",
          path: ["parts", partIndex, "kind"],
          message: "Expected each part to be of the concatenation's kind",
        });
      }

      const totalLength = parts.reduce((total, part) => total + part.length, 0);

      if (length !== totalLength) {
        context.addIssue({
          code: "custom",
          path: ["length"],
          message: `Expected the total of its parts' lengths, ${totalLength}`,
        });
      }
    }),
} satisfies {
  object: z.ZodType<StoredObjectRef>;
  item: z.ZodType<StoredItemRef>;
  concat: z.ZodType<StoredConcatRef>;
};

const getStoredRefShape = (ref: object): keyof typeof storedRefSchemas =>
  "parts" in ref ? "concat" : "of" in ref ? "item" : "object";

/**
 * Checks a stored payload reference against the kind and arity it's expected to have, and its shape against its
 * schema: e.g. that an array's `length` is a non-negative safe integer, and that a concatenation's is the total of its
 * parts'. The value it refers to isn't checked, since that would mean fetching it.
 *
 * @returns the first problem found, with its path into the reference, or `undefined` if the reference is valid.
 */
export const validateStoredPayloadRef = ({
  kind,
  array,
  ref,
  path = [],
}: {
  kind: PayloadKind;
  array: boolean;
  ref: StoredPayloadRef;
  path?: PropertyKey[];
}): PayloadValueProblem | undefined => {
  const problem = (message: string) => ({
    path: formatPayloadPath(path),
    message,
  });

  if (!(storableKinds as readonly PayloadKind[]).includes(kind)) {
    return problem(
      `${kind} values are never stored, so can't be a stored payload reference`,
    );
  }
  if (ref.kind !== kind) {
    return problem(
      `Expected a stored ${kind} reference, but it is of kind ${String(ref.kind)}`,
    );
  }
  if (ref.array !== array) {
    return problem(
      array
        ? "Expected a reference to a stored array, but it is to a single value"
        : "Expected a reference to a single stored value, but it is to an array",
    );
  }
  return firstProblem(storedRefSchemas[getStoredRefShape(ref)], ref, path);
};

const checkItem = ({
  kind,
  item,
  allowStoredRefs,
  path,
}: {
  kind: PayloadKind;
  item: unknown;
  allowStoredRefs: boolean;
  path: PropertyKey[];
}): PayloadValueProblem | undefined => {
  if (isStoredPayloadRef(item)) {
    return allowStoredRefs
      ? validateStoredPayloadRef({ kind, array: false, ref: item, path })
      : {
          path: formatPayloadPath(path),
          message:
            "A stored payload reference can only be created by a flow's own steps",
        };
  }

  return firstProblem(payloadKindSchemas[kind], item, path);
};

/**
 * Checks a value against a payload kind, and whether it's an array. Only checks: it never changes the value.
 *
 * With `allowStoredRefs`, a value of a stored kind may also be a stored reference, as an action's output or an input
 * resolved from one is. The reference is checked (see `validateStoredPayloadRef`), but not the value it refers to,
 * since that would mean fetching it. An inline value of a stored kind is checked in full either way.
 *
 * @returns the first problem found, or `undefined` if the value is valid.
 */
export const validatePayloadValue = ({
  kind,
  array,
  value,
  allowStoredRefs,
}: {
  kind: PayloadKind;
  array: boolean;
  value: unknown;
  allowStoredRefs: boolean;
}): PayloadValueProblem | undefined => {
  if (!array) {
    return checkItem({ kind, item: value, allowStoredRefs, path: [] });
  }

  if (isStoredPayloadRef(value)) {
    return allowStoredRefs
      ? validateStoredPayloadRef({ kind, array: true, ref: value })
      : checkItem({ kind, item: value, allowStoredRefs, path: [] });
  }

  if (!Array.isArray(value)) {
    return { path: "", message: "Expected an array" };
  }

  for (const [index, item] of value.entries()) {
    const problem = checkItem({ kind, item, allowStoredRefs, path: [index] });
    if (problem) {
      return problem;
    }
  }

  return undefined;
};
