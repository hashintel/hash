import { describe, expect, it } from "vitest";

import { validateCondition } from "@local/hash-isomorphic-utils/flows/filter-condition";

import { getConditionTargets } from "../shared/condition-targets";
import { readConditionForm, toFilterCondition } from "./condition-form";

import type { ConditionTarget } from "../shared/condition-targets";
import type { ConditionForm } from "./condition-form";
import type { BaseUrl } from "@blockprotocol/type-system";

const statusUrl =
  "https://example.com/@acme/types/property-type/status/" as BaseUrl;
const scoreUrl =
  "https://example.com/@acme/types/property-type/score/" as BaseUrl;

const byKey = (targets: ConditionTarget[]) =>
  new Map(targets.map((target) => [target.key, target]));

const entityTargets = byKey(
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
  }),
);

const numberTargets = byKey(
  getConditionTargets({ kind: "Number", valueLabel: "Value", properties: [] }),
);

describe("toFilterCondition", () => {
  it("builds a condition the engine accepts for the value's kind", () => {
    const form: ConditionForm = {
      join: "any",
      rows: [
        {
          targetKey: `property:${statusUrl}`,
          operator: "equals",
          value: "Active",
        },
        {
          targetKey: `property:${scoreUrl}`,
          operator: "greaterThan",
          value: 8,
        },
        { targetKey: `property:${scoreUrl}`, operator: "isEmpty" },
      ],
    };
    const condition = toFilterCondition(form, entityTargets);

    expect(condition).not.toBeNull();
    expect(validateCondition(condition!, "EntityId")).toBeUndefined();
    expect(readConditionForm(condition, entityTargets)).toEqual(form);

    const onValue = toFilterCondition(
      {
        join: "all",
        rows: [{ targetKey: "input", operator: "lessThan", value: 3 }],
      },
      numberTargets,
    );

    expect(validateCondition(onValue!, "Number")).toBeUndefined();

    const dateTimeTargets = byKey(
      getConditionTargets({
        kind: "DateTime",
        valueLabel: "Value",
        properties: [],
      }),
    );
    const onDateTime = toFilterCondition(
      {
        join: "all",
        rows: [
          {
            targetKey: "input",
            operator: "onSameUtcDate",
            value: "2026-10-16T16:00:00+02:00",
          },
        ],
      },
      dateTimeTargets,
    );

    expect(validateCondition(onDateTime!, "DateTime")).toBeUndefined();
  });

  it("leaves no condition once every row is removed, as a group needs one", () => {
    expect(toFilterCondition({ join: "all", rows: [] }, numberTargets)).toBe(
      null,
    );
  });
});

describe("readConditionForm", () => {
  const leaf = {
    kind: "condition",
    subject: {
      kind: "entityProperty",
      propertyTypeBaseUrl: statusUrl,
      payloadKind: "Text",
    },
    operator: "equals",
    value: { kind: "Text", value: "Active" },
  };

  it.each([
    [
      "a nested group",
      { kind: "all", conditions: [{ kind: "any", conditions: [leaf] }] },
    ],
    [
      "an entity type check",
      {
        kind: "all",
        conditions: [
          {
            kind: "condition",
            subject: { kind: "entityType" },
            operator: "isOfType",
            value: { kind: "BaseUrl", value: statusUrl },
          },
        ],
      },
    ],
    [
      "a status value that isn't one of its options",
      {
        kind: "all",
        conditions: [{ ...leaf, value: { kind: "Text", value: "Closed" } }],
      },
    ],
    [
      "an operator a status doesn't offer",
      { kind: "all", conditions: [{ ...leaf, operator: "contains" }] },
    ],
    [
      "a property read as another kind than it has",
      {
        kind: "all",
        conditions: [
          {
            ...leaf,
            subject: { ...leaf.subject, propertyTypeBaseUrl: scoreUrl },
          },
        ],
      },
    ],
    ["an empty group", { kind: "all", conditions: [] }],
  ])("shows %s read-only", (_, condition) => {
    expect(readConditionForm(condition, entityTargets)).toBeNull();
  });
});
