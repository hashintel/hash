import { describe, expect, it } from "vitest";

import { orderBy } from "./order-by.js";

import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import type { SortKey } from "@local/hash-isomorphic-utils/flows/sort-key";
import type {
  PayloadKind,
  PayloadKindValues,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";

const byItem = (
  payloadKind: SortKey["subject"]["payloadKind"],
  direction: SortKey["direction"] = "ascending",
): SortKey => ({ subject: { kind: "input", payloadKind }, direction });

const sorted = <Kind extends PayloadKind>(
  kind: Kind,
  values: PayloadKindValues[Kind][],
  sortKey: SortKey,
) => {
  const result = orderBy({ kind, value: Object.freeze(values) }, sortKey);
  return result.status === "success" ? result.items.value : result;
};

const scoreUrl = "https://example.com/property-type/score/" as BaseUrl;

/** Proposed entities, each named by its summary, with the given score property (or none, for `undefined`). */
const entitiesWithScores = (scores: Record<string, unknown>) =>
  Object.entries(scores).map(
    ([summary, score]) =>
      ({
        summary,
        properties: score === undefined ? {} : { [scoreUrl]: score },
        entityTypeIds: [],
      }) as unknown as ProposedEntity,
  );

const byScore = (direction: SortKey["direction"]): SortKey => ({
  subject: {
    kind: "entityProperty",
    propertyTypeBaseUrl: scoreUrl,
    payloadKind: "Number",
  },
  direction,
});

const summaries = (result: ReturnType<typeof sorted>) =>
  Array.isArray(result)
    ? result.map((entity) => (entity as ProposedEntity).summary)
    : result;

describe("orderBy", () => {
  it("sorts numbers numerically, not as text", () => {
    expect(sorted("Number", [10, 9, 100, -1], byItem("Number"))).toEqual([
      -1, 9, 10, 100,
    ]);
  });

  it("sorts descending", () => {
    expect(
      sorted("Number", [10, 9, 100], byItem("Number", "descending")),
    ).toEqual([100, 10, 9]);
  });

  it("sorts dates in time order", () => {
    expect(
      sorted(
        "Date",
        ["2024-12-01", "2023-06-15", "2024-01-31"],
        byItem("Date"),
      ),
    ).toEqual(["2023-06-15", "2024-01-31", "2024-12-01"]);
  });

  it("sorts text alphabetically, ignoring case and accents first", () => {
    expect(
      sorted("Text", ["zebra", "Cherry", "éclair", "apple"], byItem("Text")),
    ).toEqual(["apple", "Cherry", "éclair", "zebra"]);
  });

  it("sorts false before true", () => {
    expect(
      sorted("Boolean", [true, false, true, false], byItem("Boolean")),
    ).toEqual([false, false, true, true]);
  });

  it.each(["ascending", "descending"] as const)(
    "keeps equal values in their input order when sorting %s",
    (direction) => {
      const entities = entitiesWithScores({ a: 2, b: 1, c: 2, d: 1 });
      expect(
        summaries(sorted("ProposedEntity", entities, byScore(direction))),
      ).toEqual(
        direction === "ascending" ? ["b", "d", "a", "c"] : ["a", "c", "b", "d"],
      );
    },
  );

  it.each(["ascending", "descending"] as const)(
    "puts missing and empty values last when sorting %s",
    (direction) => {
      const entities = entitiesWithScores({
        missing: undefined,
        one: 1,
        null: null,
        empty: "",
        three: 3,
      });
      expect(
        summaries(sorted("ProposedEntity", entities, byScore(direction))),
      ).toEqual(
        direction === "ascending"
          ? ["one", "three", "missing", "null", "empty"]
          : ["three", "one", "missing", "null", "empty"],
      );
    },
  );

  it.each([
    { name: "a value of another kind", score: "3" },
    { name: "a number that isn't finite", score: Number.NaN },
    { name: "a property with several values", score: [1, 2] },
  ])("fails without a partial list on $name", ({ score }) => {
    const result = orderBy(
      {
        kind: "ProposedEntity",
        value: entitiesWithScores({ a: 1, b: score }),
      },
      byScore("ascending"),
    );
    expect(result).toMatchObject({ status: "error", code: "invalidValue" });
    expect(result).not.toHaveProperty("items");
  });

  it("fails on a date that isn't an ISO calendar date", () => {
    expect(
      orderBy({ kind: "Date", value: ["2024-02-30"] }, byItem("Date")),
    ).toMatchObject({ status: "error", code: "invalidValue" });
  });

  it("fails on an entity the user can't read", () => {
    const entityId =
      "00000000-0000-4000-8000-000000000001~00000000-0000-4000-8000-000000000011" as EntityId;
    expect(
      orderBy({ kind: "EntityId", value: [entityId] }, byScore("ascending"), {
        entities: new Map(),
      }),
    ).toMatchObject({ status: "error", code: "entityRequired" });
  });

  it.each<{ name: string; kind: PayloadKind; sortKey: unknown }>([
    {
      name: "a subject of a kind that can't be sorted",
      kind: "EntityId",
      sortKey: byItem("EntityId" as "Text"),
    },
    {
      name: "a subject that doesn't fit the items",
      kind: "Number",
      sortKey: {
        subject: { kind: "field", path: ["score"], payloadKind: "Number" },
        direction: "ascending",
      },
    },
    {
      name: "an entity type subject",
      kind: "EntityId",
      sortKey: { subject: { kind: "entityType" }, direction: "ascending" },
    },
    {
      name: "an unknown direction",
      kind: "Number",
      sortKey: { ...byItem("Number"), direction: "up" },
    },
  ])("rejects $name, even for an empty list", ({ kind, sortKey }) => {
    expect(orderBy({ kind, value: [] }, sortKey as SortKey)).toMatchObject({
      status: "error",
      code: "invalidSortKey",
    });
  });
});
