import { describe, expect, it } from "vitest";

import { validateQueryFilter } from "@local/hash-isomorphic-utils/flows/query-entities";

import { evaluateCondition } from "../filter-action/evaluate-condition.js";
import { conditionToGraphFilter } from "./condition-to-graph-filter.js";

import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import type { Filter, FilterExpression } from "@local/hash-graph-client";
import type { FilterValue } from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import type {
  ConditionNode,
  FilterCondition,
  FilterLeaf,
  ScalarKind,
} from "@local/hash-isomorphic-utils/flows/filter-condition";

type TestEntity = {
  properties: Record<string, unknown>;
  entityTypeIds: VersionedUrl[];
};

/**
 * A model of how the graph evaluates a filter, from its SQL: a missing property is `NULL`, which comparisons and
 * `not` propagate, and property values compare as `jsonb`, ordering strings before numbers before booleans. The
 * entity is joined with each of its own types, and matches if any of those rows does.
 */
const evaluateGraphFilter = (
  filter: Filter,
  row: { properties: Record<string, unknown>; type: VersionedUrl },
): boolean | null => {
  const resolve = (expression: FilterExpression): unknown => {
    if ("parameter" in expression) {
      return expression.parameter;
    }
    const [token, field] = expression.path;
    if (token === "properties") {
      return row.properties[field as string];
    }
    if (token === "type(inheritanceDepth = 0)" && field === "versionedUrl") {
      return row.type;
    }
    throw new Error(`Unexpected path ${expression.path.join(".")}`);
  };
  const rank = (value: unknown) =>
    ["string", "number", "boolean"].indexOf(typeof value);
  const compare = (left: unknown, right: unknown) =>
    rank(left) !== rank(right)
      ? rank(left) - rank(right)
      : (left as string) < (right as string)
        ? -1
        : (left as string) > (right as string)
          ? 1
          : 0;
  const text = (value: unknown) =>
    typeof value === "string" ? value : JSON.stringify(value);

  const [[operator, operand]] = Object.entries(filter) as [[string, unknown]];
  switch (operator) {
    case "all": {
      const results = (operand as Filter[]).map((child) =>
        evaluateGraphFilter(child, row),
      );
      return results.includes(false)
        ? false
        : results.includes(null)
          ? null
          : true;
    }
    case "any": {
      const results = (operand as Filter[]).map((child) =>
        evaluateGraphFilter(child, row),
      );
      return results.includes(true)
        ? true
        : results.includes(null)
          ? null
          : false;
    }
    case "not": {
      const result = evaluateGraphFilter(operand as Filter, row);
      return result === null ? null : !result;
    }
    case "exists":
      return resolve(operand as FilterExpression) !== undefined;
  }
  const [left, right] = (operand as FilterExpression[]).map(resolve);
  if (left === undefined || right === undefined) {
    return null;
  }
  switch (operator) {
    case "equal":
      return compare(left, right) === 0;
    case "notEqual":
      return compare(left, right) !== 0;
    case "greater":
      return compare(left, right) > 0;
    case "greaterOrEqual":
      return compare(left, right) >= 0;
    case "less":
      return compare(left, right) < 0;
    case "lessOrEqual":
      return compare(left, right) <= 0;
    case "startsWith":
      return text(left).startsWith(text(right));
    case "endsWith":
      return text(left).endsWith(text(right));
    case "containsSegment":
      return text(left).includes(text(right));
    default:
      throw new Error(`Unexpected operator ${operator}`);
  }
};

const queryMatches = (condition: ConditionNode, entity: TestEntity) =>
  entity.entityTypeIds.some(
    (type) =>
      evaluateGraphFilter(conditionToGraphFilter(condition), {
        properties: entity.properties,
        type,
      }) === true,
  );

const filterMatches = (condition: FilterCondition, entity: TestEntity) => {
  const result = evaluateCondition(condition, {
    kind: "ProposedEntity",
    value: entity,
  });
  if (result.status === "error") {
    throw new Error(result.message);
  }
  return result.matches;
};

const all = (...conditions: ConditionNode[]): FilterCondition => ({
  kind: "all",
  conditions,
});
const any = (...conditions: ConditionNode[]): FilterCondition => ({
  kind: "any",
  conditions,
});
const not = (condition: ConditionNode): ConditionNode => ({
  kind: "not",
  condition,
});

const companyType =
  "https://example.com/types/entity-type/company/v/1" as VersionedUrl;
const personType =
  "https://example.com/types/entity-type/person/v/1" as VersionedUrl;
const valueUrl = "https://example.com/types/property-type/value/" as BaseUrl;
const nameUrl = "https://example.com/types/property-type/name/" as BaseUrl;
const scoreUrl = "https://example.com/types/property-type/score/" as BaseUrl;

const entity = (properties: Record<string, unknown>): TestEntity => ({
  properties,
  entityTypeIds: [companyType],
});

const leaf = (
  kind: ScalarKind,
  operator: string,
  operand: unknown,
  propertyTypeBaseUrl = valueUrl,
) =>
  ({
    kind: "condition",
    subject: { kind: "entityProperty", propertyTypeBaseUrl, payloadKind: kind },
    operator,
    value:
      operator === "isEmpty" || operator === "isNotEmpty"
        ? undefined
        : ({ kind, value: operand } as FilterValue),
  }) as FilterLeaf;

const equality = ["equals", "notEquals", "isEmpty", "isNotEmpty"];
const ordering = [
  ...equality,
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
];

/** The operators each kind of property supports, the operand to compare with, and the values to compare it to. */
const cases: {
  kind: ScalarKind;
  operators: string[];
  operand: unknown;
  values: unknown[];
}[] = [
  {
    kind: "Text",
    operators: [...equality, "contains", "startsWith", "endsWith"],
    operand: "Acme",
    values: ["Acme", "Acme Corp", "The Acme", "The Acme Corp", "acme", ""],
  },
  {
    kind: "Number",
    operators: ordering,
    operand: 5,
    values: [5, 7, 0, -1, 5.5],
  },
  {
    kind: "Date",
    operators: ordering,
    operand: "2024-03-10",
    values: ["2024-03-10", "2024-03-09", "2024-12-01", "2023-12-31", ""],
  },
  {
    kind: "Boolean",
    operators: equality,
    operand: true,
    values: [true, false],
  },
  {
    kind: "VersionedUrl",
    operators: equality,
    operand: companyType,
    values: [companyType, personType, ""],
  },
  {
    kind: "EntityId",
    operators: equality,
    operand:
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002",
    values: [
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000002",
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000003",
    ],
  },
  {
    kind: "ActorType",
    operators: equality,
    operand: "user",
    values: ["user", "machine"],
  },
  {
    kind: "GoogleAccountId",
    operators: equality,
    operand: "account-1",
    values: ["account-1", "account-2", ""],
  },
];

describe("conditionToGraphFilter", () => {
  describe.each(cases)(
    "on a $kind property",
    ({ kind, operators, operand, values }) => {
      const entities = [
        entity({}),
        ...values.map((value) => entity({ [valueUrl]: value })),
      ];

      it("supports exactly these operators", () => {
        expect(
          new Set(
            [...ordering, "contains", "startsWith", "endsWith"].filter(
              (operator) =>
                validateQueryFilter(all(leaf(kind, operator, operand))) ===
                undefined,
            ),
          ),
        ).toEqual(new Set(operators));
      });

      it.each(operators)(
        "matches what Filter matches with %s, negated or not",
        (operator) => {
          const condition = leaf(kind, operator, operand);
          for (const testEntity of entities) {
            /* A value is missing, or empty text, matches notEquals in Filter, but only isEmpty in a query. */
            const expected =
              filterMatches(all(condition), testEntity) &&
              (operator !== "notEquals" ||
                filterMatches(
                  all(leaf(kind, "isNotEmpty", undefined)),
                  testEntity,
                ));

            expect({
              value: testEntity.properties[valueUrl],
              matches: queryMatches(condition, testEntity),
              notMatches: queryMatches(not(condition), testEntity),
            }).toEqual({
              value: testEntity.properties[valueUrl],
              matches: expected,
              notMatches: !expected,
            });
          }
        },
      );
    },
  );

  it("matches only present values that differ with notEquals", () => {
    const condition = leaf("Text", "notEquals", "Acme");

    expect(
      [{}, { [valueUrl]: "" }, { [valueUrl]: "Acme" }, { [valueUrl]: "Other" }]
        .map(entity)
        .map((testEntity) => queryMatches(condition, testEntity)),
    ).toEqual([false, false, false, true]);
  });

  it("combines conditions with all, any and not as Filter does", () => {
    const condition = any(
      all(
        leaf("Text", "startsWith", "Acme", nameUrl),
        leaf("Number", "greaterThan", 8, scoreUrl),
      ),
      not(leaf("Number", "isNotEmpty", undefined, scoreUrl)),
    );
    const entities = [
      { [nameUrl]: "Acme Corp", [scoreUrl]: 9 },
      { [nameUrl]: "Acme Corp", [scoreUrl]: 3 },
      { [nameUrl]: "Other", [scoreUrl]: 9 },
      { [nameUrl]: "Other" },
      {},
    ].map(entity);

    expect(
      entities.map((testEntity) => queryMatches(condition, testEntity)),
    ).toEqual([true, false, false, true, true]);
    expect(
      entities.map((testEntity) => filterMatches(condition, testEntity)),
    ).toEqual([true, false, false, true, true]);
  });

  it("matches an entity type's exact version among the entity's own types", () => {
    const isCompany = all({
      kind: "condition",
      subject: { kind: "entityType" },
      operator: "isOfType",
      value: { kind: "VersionedUrl", value: companyType },
    });

    expect(conditionToGraphFilter(isCompany)).toEqual({
      all: [
        {
          equal: [
            { path: ["type(inheritanceDepth = 0)", "versionedUrl"] },
            { parameter: companyType },
          ],
        },
      ],
    });
    expect(
      [
        [companyType],
        [personType, companyType],
        [personType],
        ["https://example.com/types/entity-type/company/v/2" as VersionedUrl],
      ].map((entityTypeIds) =>
        queryMatches(isCompany, { properties: {}, entityTypeIds }),
      ),
    ).toEqual([true, true, false, false]);
  });
});
