import { describe, expect, it } from "vitest";

import { validateAggregation } from "@local/hash-isomorphic-utils/flows/aggregation";

import { getConditionTargets } from "../shared/condition-targets";
import { readAggregationForm, toAggregation } from "./aggregation-form";

import type { ConditionTarget } from "../shared/condition-targets";
import type { BaseUrl } from "@blockprotocol/type-system";

const scoreUrl =
  "https://example.com/@acme/types/property-type/score/" as BaseUrl;
const nameUrl =
  "https://example.com/@acme/types/property-type/name/" as BaseUrl;

const byKey = (targets: ConditionTarget[]) =>
  new Map(targets.map((target) => [target.key, target]));

const entityTargets = byKey(
  getConditionTargets({
    kind: "EntityId",
    valueLabel: "Item",
    properties: [
      { baseUrl: scoreUrl, title: "Score", valueKind: { kind: "Number" } },
      { baseUrl: nameUrl, title: "Name", valueKind: { kind: "Text" } },
    ],
  }),
);

describe("toAggregation", () => {
  it("builds aggregations the engine accepts, which read back as they were set", () => {
    const forms = [
      { operation: "count" },
      { operation: "average", targetKey: `property:${scoreUrl}` },
    ] as const;

    for (const form of forms) {
      const aggregation = toAggregation(form, entityTargets);

      expect(aggregation).not.toBeNull();
      expect(validateAggregation(aggregation!, "EntityId")).toBeUndefined();
      expect(readAggregationForm(aggregation, entityTargets)).toEqual(form);
    }
  });

  it("has nothing to run until an operation other than count has its number", () => {
    expect(
      toAggregation({ operation: "sum", targetKey: null }, entityTargets),
    ).toBeNull();
  });
});

describe("readAggregationForm", () => {
  it("can't show an aggregation of a text, on a field, or a count with a subject", () => {
    const aggregations = [
      {
        operation: "max",
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: nameUrl,
          payloadKind: "Text",
        },
      },
      {
        operation: "sum",
        subject: { kind: "field", path: ["score"], payloadKind: "Number" },
      },
      {
        operation: "count",
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: scoreUrl,
          payloadKind: "Number",
        },
      },
    ];

    for (const aggregation of aggregations) {
      expect(readAggregationForm(aggregation, entityTargets)).toBeNull();
    }
  });
});
