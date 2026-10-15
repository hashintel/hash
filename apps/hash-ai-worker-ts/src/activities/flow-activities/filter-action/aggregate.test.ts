import { describe, expect, it } from "vitest";

import { aggregate } from "./aggregate.js";

import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type {
  PayloadKind,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";

const scoreUrl = "https://example.com/property-type/score/" as BaseUrl;

/** Proposed entities with the given score property (or none, for `undefined`). */
const entitiesWithScores = (scores: unknown[]) =>
  scores.map(
    (score) =>
      ({
        properties: score === undefined ? {} : { [scoreUrl]: score },
        entityTypeIds: [],
      }) as unknown as ProposedEntity,
  );

const ofScore = (
  operation: "sum" | "average" | "min" | "max",
): Parameters<typeof aggregate>[1] => ({
  operation,
  subject: {
    kind: "entityProperty",
    propertyTypeBaseUrl: scoreUrl,
    payloadKind: "Number",
  },
});

const aggregateScores = (
  scores: unknown[],
  operation: "sum" | "average" | "min" | "max",
) =>
  aggregate(
    { kind: "ProposedEntity", value: entitiesWithScores(scores) },
    ofScore(operation),
  );

describe("aggregate", () => {
  it.each([
    { operation: "sum", result: 2 },
    { operation: "average", result: 2 / 3 },
    { operation: "min", result: -4 },
    { operation: "max", result: 5 },
  ] as const)("takes the $operation of the values", ({ operation, result }) => {
    expect(aggregateScores([5, -4, 1], operation)).toEqual({
      status: "success",
      result,
    });
  });

  it.each(["sum", "average", "min", "max"] as const)(
    "ignores missing and empty values when taking the %s",
    (operation) => {
      expect(aggregateScores([undefined, 4, null, "", 2], operation)).toEqual({
        status: "success",
        result: { sum: 6, average: 3, min: 2, max: 4 }[operation],
      });
    },
  );

  it("reads the items themselves", () => {
    expect(
      aggregate(
        { kind: "Number", value: [3, 1, 2] },
        { operation: "max", subject: { kind: "input", payloadKind: "Number" } },
      ),
    ).toEqual({ status: "success", result: 3 });
  });

  it("gives 0 for the sum of no values", () => {
    expect(aggregateScores([], "sum")).toEqual({
      status: "success",
      result: 0,
    });
  });

  it.each(["average", "min", "max"] as const)(
    "gives no result for the %s of no values",
    (operation) => {
      expect(aggregateScores([], operation)).toEqual({ status: "success" });
      expect(aggregateScores([undefined, null], operation)).toEqual({
        status: "success",
      });
    },
  );

  it.each([
    { name: "a value of another kind", score: "3" },
    { name: "a number that isn't finite", score: Number.POSITIVE_INFINITY },
    { name: "a property with several values", score: [1, 2] },
  ])("fails without a result on $name", ({ score }) => {
    const result = aggregateScores([1, score], "sum");
    expect(result).toMatchObject({ status: "error", code: "invalidValue" });
    expect(result).not.toHaveProperty("result");
  });

  it("fails on an entity the user can't read", () => {
    const entityId =
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000011" as EntityId;
    expect(
      aggregate({ kind: "EntityId", value: [entityId] }, ofScore("sum"), {
        entities: new Map(),
      }),
    ).toMatchObject({ status: "error", code: "entityRequired" });
  });

  it.each<{ name: string; kind: PayloadKind; aggregation: unknown }>([
    {
      name: "an unknown operation",
      kind: "Number",
      aggregation: { operation: "median" },
    },
    {
      name: "a count with a subject",
      kind: "Number",
      aggregation: {
        operation: "count",
        subject: { kind: "input", payloadKind: "Number" },
      },
    },
    {
      name: "a sum without a subject",
      kind: "Number",
      aggregation: { operation: "sum" },
    },
    {
      name: "a subject that isn't a Number",
      kind: "Text",
      aggregation: {
        operation: "sum",
        subject: { kind: "input", payloadKind: "Text" },
      },
    },
    {
      name: "an entity type subject",
      kind: "EntityId",
      aggregation: { operation: "sum", subject: { kind: "entityType" } },
    },
    {
      name: "a subject that doesn't fit the items",
      kind: "Number",
      aggregation: ofScore("sum"),
    },
  ])("rejects $name, even for an empty list", ({ kind, aggregation }) => {
    expect(
      aggregate(
        { kind, value: [] },
        aggregation as Parameters<typeof aggregate>[1],
      ),
    ).toMatchObject({ status: "error", code: "invalidAggregation" });
  });
});
