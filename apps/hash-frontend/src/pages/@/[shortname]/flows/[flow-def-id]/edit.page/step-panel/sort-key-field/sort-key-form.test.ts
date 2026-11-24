import { describe, expect, it } from "vitest";

import { validateSortKey } from "@local/hash-isomorphic-utils/flows/sort-key";

import { getConditionTargets } from "../shared/condition-targets";
import { readSortForm, toSortKey } from "./sort-key-form";

import type { ConditionTarget } from "../shared/condition-targets";
import type { BaseUrl } from "@blockprotocol/type-system";

const scoreUrl =
  "https://example.com/@acme/types/property-type/score/" as BaseUrl;

const byKey = (targets: ConditionTarget[]) =>
  new Map(targets.map((target) => [target.key, target]));

const entityTargets = byKey(
  getConditionTargets({
    kind: "EntityId",
    valueLabel: "Item",
    properties: [
      { baseUrl: scoreUrl, title: "Score", valueKind: { kind: "Number" } },
    ],
  }),
);

describe("toSortKey", () => {
  it("builds a sort key the engine accepts, which reads back as it was set", () => {
    const score = entityTargets.get(`property:${scoreUrl}`)!;
    const sortKey = toSortKey(score, "descending");

    expect(validateSortKey(sortKey, "EntityId")).toBeUndefined();
    expect(readSortForm(sortKey, entityTargets)).toEqual({
      targetKey: score.key,
      direction: "descending",
    });

    const [dateTime] = getConditionTargets({
      kind: "DateTime",
      valueLabel: "Item",
      properties: [],
    });

    expect(
      validateSortKey(toSortKey(dateTime!, "ascending"), "DateTime"),
    ).toBeUndefined();
  });
});

describe("readSortForm", () => {
  it("can't show a sort on a field, a property it doesn't know or of another kind, or with a bad direction", () => {
    const sortKeys = [
      { subject: { kind: "field", path: ["a"], payloadKind: "Number" } },
      {
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: "https://example.com/other/",
          payloadKind: "Number",
        },
        direction: "ascending",
      },
      {
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: scoreUrl,
          payloadKind: "Text",
        },
        direction: "ascending",
      },
      {
        subject: {
          kind: "entityProperty",
          propertyTypeBaseUrl: scoreUrl,
          payloadKind: "Number",
        },
        direction: "ASCENDING",
      },
    ];

    for (const sortKey of sortKeys) {
      expect(readSortForm(sortKey, entityTargets)).toBeNull();
    }
  });
});
