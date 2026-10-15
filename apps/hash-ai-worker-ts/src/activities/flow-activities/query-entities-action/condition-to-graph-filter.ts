import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  Filter,
  ParameterExpression,
  PathExpression,
} from "@local/hash-graph-client";
import type { BinaryFilterOperator } from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import type {
  ConditionNode,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";

/** The entity's own types: not the types they inherit from. */
const directTypePath: PathExpression = {
  path: ["type(inheritanceDepth = 0)", "versionedUrl"],
};

/**
 * Entities of this exact type version, as in Filter: not those of another version of it, nor of a type that inherits
 * from it.
 *
 * The graph matches an entity's own types by joining them, a row per type, so an entity with several types matches
 * `not` of one of them through the others, and never matches `all` of two of them.
 */
export const isOfTypeFilter = (entityTypeId: VersionedUrl): Filter => ({
  equal: [directTypePath, { parameter: entityTypeId }],
});

const comparisons: Record<
  BinaryFilterOperator,
  (operands: [PathExpression, ParameterExpression]) => Filter
> = {
  equals: (operands) => ({ equal: operands }),
  notEquals: (operands) => ({ notEqual: operands }),
  greaterThan: (operands) => ({ greater: operands }),
  greaterThanOrEqual: (operands) => ({ greaterOrEqual: operands }),
  lessThan: (operands) => ({ less: operands }),
  lessThanOrEqual: (operands) => ({ lessOrEqual: operands }),
  contains: (operands) => ({ containsSegment: operands }),
  startsWith: (operands) => ({ startsWith: operands }),
  endsWith: (operands) => ({ endsWith: operands }),
};

/**
 * Whether a property has a value: it exists and isn't empty text, as in Filter.
 *
 * A comparison with a missing property is unknown in the graph (SQL `NULL`), which `not` leaves unknown, so it
 * wouldn't match `not` of the comparison. Requiring the property first makes every leaf true or false.
 */
const hasValue = (path: PathExpression): Filter[] => [
  { exists: path },
  { notEqual: [path, { parameter: "" }] },
];

const leafToGraphFilter = (leaf: FilterLeaf): Filter => {
  if (leaf.operator === "isOfType") {
    return isOfTypeFilter(leaf.value.value);
  }
  if (leaf.subject.kind === "entityType") {
    const hasType: Filter = { exists: directTypePath };
    return leaf.operator === "isEmpty" ? { not: hasType } : hasType;
  }
  if (leaf.subject.kind !== "entityProperty") {
    throw new Error(
      "A query can only filter on an entity's types and properties.",
    );
  }

  const path: PathExpression = {
    path: ["properties", leaf.subject.propertyTypeBaseUrl],
  };

  switch (leaf.operator) {
    case "isEmpty":
      return { not: { all: hasValue(path) } };
    case "isNotEmpty":
      return { all: hasValue(path) };
    default:
      return {
        all: [
          ...hasValue(path),
          comparisons[leaf.operator]([path, { parameter: leaf.value.value }]),
        ],
      };
  }
};

/**
 * Translates a condition on an entity's types and properties into a graph filter. The condition must have passed
 * `validateQueryFilter`.
 *
 * A property with a value must have one of the subject's kind: the graph compares any two JSON values, in its order
 * of JSON types, so a value of another kind doesn't fail the query as it fails Filter. A multi-valued property is
 * compared as a whole, not by its values.
 */
export const conditionToGraphFilter = (node: ConditionNode): Filter => {
  switch (node.kind) {
    case "condition":
      return leafToGraphFilter(node);
    case "not":
      return { not: conditionToGraphFilter(node.condition) };
    case "all":
      return { all: node.conditions.map(conditionToGraphFilter) };
    case "any":
      return { any: node.conditions.map(conditionToGraphFilter) };
  }
};
