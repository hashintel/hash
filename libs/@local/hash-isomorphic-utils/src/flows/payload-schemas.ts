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

import type { PayloadKind, PayloadKindValues } from "./types.js";

/**
 * Types a schema as checking `T` where zod can't infer it: a branded string, which a refinement checks, or a value
 * whose schema checks only its shape.
 */
const typed = <T>(schema: z.ZodType): z.ZodType<T> => schema as z.ZodType<T>;

const entityIdSchema = z
  .string()
  .refine(isEntityId, { message: "Expected an entity id" });

const versionedUrlSchema = z
  .string()
  .refine((value) => validateVersionedUrl(value).type === "Ok", {
    message: "Expected a versioned URL",
  });

/** A JSON object whose contents aren't checked here. */
const objectSchema = z.record(z.string(), z.unknown());

const entityOperationSchema = z.enum([
  "create",
  "update",
  "already-exists-as-proposed",
]);

const localOrExistingEntityIdSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("proposed-entity"),
    localId: entityIdSchema,
  }),
  z.strictObject({
    kind: z.literal("existing-entity"),
    entityId: entityIdSchema,
  }),
]);

const proposedEntityShape = {
  claims: z.object({
    isSubjectOf: z.array(entityIdSchema),
    isObjectOf: z.array(entityIdSchema),
  }),
  provenance: objectSchema,
  propertyMetadata: objectSchema,
  localEntityId: entityIdSchema,
  entityTypeIds: z.array(versionedUrlSchema).min(1),
  summary: z.string().optional(),
  properties: objectSchema,
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
  z.strictObject({ kind: z.literal("input"), payloadKind: payloadKindSchema }),
  z.strictObject({
    kind: z.literal("field"),
    path: z.array(z.string()),
    payloadKind: payloadKindSchema,
  }),
  z.strictObject({
    kind: z.literal("entityProperty"),
    propertyTypeBaseUrl: z.string(),
    payloadKind: payloadKindSchema,
  }),
] as const;

const valueSubjectSchema = z.discriminatedUnion("kind", valueSubjectSchemas);

const conditionSubjectSchema = z.discriminatedUnion("kind", [
  ...valueSubjectSchemas,
  z.strictObject({ kind: z.literal("entityType") }),
]);

const conditionGroupOf = (conditionNode: z.ZodType) =>
  z.strictObject({
    kind: z.enum(["all", "any"]),
    conditions: z.array(conditionNode).min(1),
  });

const conditionNodeSchema: z.ZodType = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("condition"),
      subject: conditionSubjectSchema,
      operator: z.string(),
      value: z
        .strictObject({
          kind: z.union([payloadKindSchema, z.literal("BaseUrl")]),
          value: z.unknown(),
        })
        .optional(),
      includeSubtypes: z.boolean().optional(),
    }),
    conditionGroupOf(conditionNodeSchema),
    z.strictObject({ kind: z.literal("not"), condition: conditionNodeSchema }),
  ]),
);

/**
 * The schema of each payload kind's values. Adding a kind to `PayloadKindValues` without a schema here fails to
 * compile.
 *
 * Kinds defined by flows are checked in full, except where noted. Kinds that hold the graph's own structures (entity
 * queries, properties and their metadata, and proposed entities) are checked only down to those structures: the graph
 * checks them in full when an action uses them.
 *
 * A stored kind's schema checks the value itself, not a stored reference to it (see `validatePayloadValue`).
 */
export const payloadKindSchemas = {
  ActorType: z.enum(["user", "machine"]),
  Aggregation: typed<PayloadKindValues["Aggregation"]>(
    z.discriminatedUnion("operation", [
      z.strictObject({ operation: z.literal("count") }),
      z.strictObject({
        operation: z.enum(["sum", "average", "min", "max"]),
        subject: valueSubjectSchema,
      }),
    ]),
  ),
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
  Duration: z.strictObject({
    amount: z.number(),
    unit: z.enum(["seconds", "minutes", "hours", "days", "weeks"]),
  }),
  EntityId: typed<PayloadKindValues["EntityId"]>(entityIdSchema),
  EntityQuery: typed<PayloadKindValues["EntityQuery"]>(
    z.strictObject({
      filter: objectSchema,
      includeDrafts: z.boolean().optional(),
      limit: z.int().nonnegative().optional(),
      sortingPaths: z.array(objectSchema).optional(),
      temporalAxes: objectSchema.optional(),
    }),
  ),
  FailedEntityProposal: typed<PayloadKindValues["FailedEntityProposal"]>(
    z.object({
      existingEntityId: entityIdSchema.optional(),
      operation: entityOperationSchema.optional(),
      proposedEntity: proposedEntityWithResolvedLinksSchema,
      message: z.string(),
    }),
  ),
  FilterCondition: typed<PayloadKindValues["FilterCondition"]>(
    conditionGroupOf(conditionNodeSchema),
  ),
  FormattedText: z.strictObject({
    content: z.string(),
    format: z.enum(textFormats),
  }),
  GoogleAccountId: z.string(),
  GoogleSheet: z.union(
    [
      z.strictObject({ spreadsheetId: z.string() }),
      z.strictObject({ newSheetName: z.string() }),
    ],
    { error: "Expected either a spreadsheetId or a newSheetName" },
  ),
  Number: z.number(),
  PersistedEntityMetadata: typed<PayloadKindValues["PersistedEntityMetadata"]>(
    z.strictObject({
      entityId: entityIdSchema,
      operation: entityOperationSchema,
    }),
  ),
  PropertyObjectWithMetadata: typed<
    PayloadKindValues["PropertyObjectWithMetadata"]
  >(
    z.object({
      value: z.record(z.string(), objectSchema),
      metadata: objectSchema.optional(),
    }),
  ),
  PropertyPatch: typed<PayloadKindValues["PropertyPatch"]>(
    z.discriminatedUnion("op", [
      z.object({
        op: z.enum(["add", "replace"]),
        path: z.array(z.union([z.string(), z.int().nonnegative()])),
        property: objectSchema,
      }),
      z.object({
        op: z.literal("remove"),
        path: z.array(z.union([z.string(), z.int().nonnegative()])),
      }),
    ]),
  ),
  ProposedEntity: typed<PayloadKindValues["ProposedEntity"]>(
    z.object(proposedEntityShape),
  ),
  ProposedEntityWithResolvedLinks: typed<
    PayloadKindValues["ProposedEntityWithResolvedLinks"]
  >(proposedEntityWithResolvedLinksSchema),
  SortKey: typed<PayloadKindValues["SortKey"]>(
    z.strictObject({
      subject: valueSubjectSchema,
      direction: z.enum(["ascending", "descending"]),
    }),
  ),
  Text: z.string(),
  VersionedUrl: typed<PayloadKindValues["VersionedUrl"]>(versionedUrlSchema),
  WebPage: typed<PayloadKindValues["WebPage"]>(
    z.strictObject({
      url: z.string(),
      title: z.string(),
      htmlContent: z.string(),
      innerText: z.string(),
    }),
  ),
  WebSearchResult: typed<PayloadKindValues["WebSearchResult"]>(
    z.strictObject({ url: z.string(), title: z.string() }),
  ),
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
      if (typeof segment === "string" && identifierPattern.test(segment)) {
        return index === 0 ? segment : `.${segment}`;
      }
      return `[${JSON.stringify(String(segment))}]`;
    })
    .join("");

/** The first thing wrong with a payload value: where it is, as a path into the value (`""` for the value itself), and what's wrong. */
export type PayloadValueProblem = { path: string; message: string };

const storableKinds: readonly PayloadKind[] = [
  ...storedPayloadKinds,
  ...storedArrayPayloadKinds,
];

const checkStoredRef = ({
  kind,
  array,
  ref,
  path,
}: {
  kind: PayloadKind;
  array: boolean;
  ref: { kind: unknown; array: unknown };
  path: PropertyKey[];
}): PayloadValueProblem | undefined => {
  const problem = (message: string) => ({
    path: formatPayloadPath(path),
    message,
  });

  if (!storableKinds.includes(kind)) {
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
  return undefined;
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
      ? checkStoredRef({ kind, array: false, ref: item, path })
      : {
          path: formatPayloadPath(path),
          message:
            "A stored payload reference can only be created by a flow's own steps",
        };
  }

  const result = payloadKindSchemas[kind].safeParse(item);
  const [issue] = result.error?.issues ?? [];

  return issue
    ? {
        path: formatPayloadPath([...path, ...issue.path]),
        message: issue.message,
      }
    : undefined;
};

/**
 * Checks a value against a payload kind, and whether it's an array. Only checks: it never changes the value.
 *
 * With `allowStoredRefs`, a value of a stored kind may also be a stored reference, as an action's output or an input
 * resolved from one is. Only the reference's kind and whether it's to an array are checked, since checking the value
 * would mean fetching it. An inline value of a stored kind is checked in full either way.
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
      ? checkStoredRef({ kind, array: true, ref: value, path: [] })
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
