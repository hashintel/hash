import { describe, expect, it } from "vitest";

import { getConditionTargets } from "./condition-targets";

import type { BaseUrl } from "@blockprotocol/type-system";

const statusUrl =
  "https://example.com/@acme/types/property-type/status/" as BaseUrl;
const scoreUrl =
  "https://example.com/@acme/types/property-type/score/" as BaseUrl;

describe("getConditionTargets", () => {
  it("checks a scalar value itself and an entity by its properties, never an entity ID as text", () => {
    expect(
      getConditionTargets({
        kind: "Number",
        valueLabel: "Value",
        properties: [],
      }).map(({ label }) => label),
    ).toEqual(["Value"]);
    expect(
      getConditionTargets({
        kind: "EntityId",
        valueLabel: "Value",
        properties: [
          {
            baseUrl: statusUrl,
            title: "Status",
            valueKind: { kind: "Text", options: ["Active", "Suspended"] },
          },
          { baseUrl: scoreUrl, title: "Score", valueKind: { kind: "Number" } },
        ],
      }).map(({ label }) => label),
    ).toEqual(["Status", "Score"]);
    expect(
      getConditionTargets({
        kind: "Duration",
        valueLabel: "Value",
        properties: [],
      }),
    ).toEqual([]);
  });
});
