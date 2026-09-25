import { describe, expect, it } from "vitest";

import {
  getStatusConditionArtifactKey,
  type StatusLabel,
} from "@hashintel/petrinaut-core";
import { productionMachines } from "@hashintel/petrinaut-core/examples";
import { compileHirArtifacts } from "@hashintel/petrinaut-core/hir";

import {
  buildAnywhereView,
  buildConditionExpression,
  buildDraftDefinition,
  buildHighlightView,
  describeCondition,
  formatFieldValue,
  getCardFieldOptions,
  getDefaultCardFields,
  highlightsAsView,
  highlightsFromRules,
  humanizeField,
  moveRuleBefore,
  ruleFromHighlight,
  getRulePlaceIds,
  getSharedAttributes,
  HIGHLIGHT_VIEW_ID,
  insertRuleAsStatus,
  movePlaceToLabel,
  type DraftRule,
} from "./draft-rules";

const rule = (patch: Partial<DraftRule> = {}): DraftRule => ({
  id: "rule-1",
  labelId: "producing",
  name: "At risk",
  field: "machine_damage_ratio",
  operator: ">=",
  value: "0.8",
  expression: null,
  checks: "status",
  alsoPlaceIds: [],
  color: "#ea580c",
  icon: "warning",
  ...patch,
});

const labels: StatusLabel[] = [
  { id: "available", name: "Available", displayColor: "#000", places: ["a"] },
  { id: "producing", name: "Producing", displayColor: "#000", places: ["p"] },
  { id: "broken", name: "Broken", displayColor: "#000", places: ["b", "r"] },
];
const tracked = new Set(["a", "p", "b", "r"]);

describe("buildConditionExpression", () => {
  it("builds a token expression from field, operator and value", () => {
    expect(buildConditionExpression(rule())).toBe(
      "token.machine_damage_ratio >= 0.8",
    );
  });

  it("quotes values that are not numbers or booleans", () => {
    expect(
      buildConditionExpression(rule({ operator: "===", value: "red" })),
    ).toBe('token.machine_damage_ratio === "red"');
    expect(buildConditionExpression(rule({ value: "true" }))).toBe(
      "token.machine_damage_ratio >= true",
    );
  });

  it("returns null for an unfinished rule", () => {
    expect(buildConditionExpression(rule({ value: " " }))).toBeNull();
    expect(buildConditionExpression(rule({ expression: "" }))).toBeNull();
  });

  it("prefers the raw expression when set", () => {
    expect(
      buildConditionExpression(rule({ expression: " token.x > 1 " })),
    ).toBe("token.x > 1");
  });
});

describe("describeCondition", () => {
  it("drops the token prefix and uses readable operators", () => {
    expect(describeCondition("token.machine_damage_ratio >= 0.8")).toBe(
      "machine_damage_ratio ≥ 0.8",
    );
    expect(describeCondition('token.a !== "x" && token.b === 1')).toBe(
      'a ≠ "x" && b = 1',
    );
  });
});

describe("getRulePlaceIds", () => {
  it("checks the status's own places by default", () => {
    expect(getRulePlaceIds(rule(), labels[1], tracked)).toEqual(["p"]);
  });

  it("adds the chosen places for also check in", () => {
    expect(
      getRulePlaceIds(
        rule({ checks: "also", alsoPlaceIds: ["b", "p"] }),
        labels[1],
        tracked,
      ),
    ).toEqual(["p", "b"]);
  });

  it("checks every tracked place for anywhere", () => {
    expect(
      getRulePlaceIds(rule({ checks: "anywhere" }), labels[1], tracked),
    ).toEqual(["a", "p", "b", "r"]);
  });
});

describe("buildHighlightView", () => {
  it("has one label per finished rule, in rule order", () => {
    const view = buildHighlightView(
      [rule(), rule({ id: "rule-2", value: "" }), rule({ id: "rule-3" })],
      labels,
      tracked,
      "identity",
    );
    expect(view.id).toBe(HIGHLIGHT_VIEW_ID);
    expect(view.labels.map((label) => label.id)).toEqual(["rule-1", "rule-3"]);
    expect(view.labels[0]).toMatchObject({
      places: ["p"],
      tokenCondition: "token.machine_damage_ratio >= 0.8",
    });
  });
});

describe("insertRuleAsStatus", () => {
  it("inserts the new status just before its parent", () => {
    const next = insertRuleAsStatus(labels, rule(), tracked, {
      id: "at-risk",
      displayColor: "#f59e0b",
    });
    expect(next.map((label) => label.id)).toEqual([
      "available",
      "at-risk",
      "producing",
      "broken",
    ]);
    expect(next[1]).toMatchObject({
      name: "At risk",
      places: ["p"],
      tokenCondition: "token.machine_damage_ratio >= 0.8",
    });
  });

  it("leaves the labels alone for an unfinished rule", () => {
    const next = insertRuleAsStatus(labels, rule({ value: "" }), tracked, {
      id: "at-risk",
      displayColor: "#f59e0b",
    });
    expect(next).toEqual(labels);
  });
});

describe("movePlaceToLabel", () => {
  const split: StatusLabel[] = [
    labels[0]!,
    {
      id: "at-risk",
      name: "At risk",
      displayColor: "#000",
      places: ["p"],
      tokenCondition: "token.machine_damage_ratio >= 0.8",
    },
    labels[1]!,
    labels[2]!,
  ];

  it("removes the place from other plain statuses", () => {
    const next = movePlaceToLabel(labels, "p", "broken");
    expect(next.find((label) => label.id === "producing")?.places).toEqual([]);
    expect(next.find((label) => label.id === "broken")?.places).toEqual([
      "b",
      "r",
      "p",
    ]);
  });

  it("keeps the place in a status with a token condition", () => {
    const next = movePlaceToLabel(split, "p", "broken");
    expect(next.find((label) => label.id === "at-risk")?.places).toEqual(["p"]);
    expect(next.find((label) => label.id === "producing")?.places).toEqual([]);
  });

  it("keeps the place in its plain status when it joins a filtered one", () => {
    const next = movePlaceToLabel(split, "b", "at-risk");
    expect(next.find((label) => label.id === "at-risk")?.places).toEqual([
      "p",
      "b",
    ]);
    expect(next.find((label) => label.id === "broken")?.places).toEqual([
      "b",
      "r",
    ]);
  });
});

describe("draft compile", () => {
  const sdcpn = productionMachines.petriNetDefinition;
  const view = sdcpn.statusViews![0]!;
  const producing = view.labels.find((label) => label.name === "Producing")!;
  const machineRule = rule({ labelId: producing.id });
  const machineTracked = new Set(view.labels.flatMap((label) => label.places));

  it("compiles conditions for draft and synthetic views", () => {
    const draftLabels = insertRuleAsStatus(
      view.labels,
      machineRule,
      machineTracked,
      { id: "draft-at-risk", displayColor: "#f59e0b" },
    );
    const draft = buildDraftDefinition(
      sdcpn,
      { ...view, labels: draftLabels },
      [
        buildHighlightView(
          [machineRule],
          view.labels,
          machineTracked,
          view.identityRef,
        ),
        buildAnywhereView(machineRule, machineTracked, view.identityRef)!,
      ],
    );
    const { artifacts, failures } = compileHirArtifacts(draft);
    expect(
      failures.filter(
        (failure) => failure.itemType === "status-label-condition",
      ),
    ).toEqual([]);
    expect(Object.keys(artifacts.statusConditions).sort()).toEqual(
      [
        getStatusConditionArtifactKey(view.id, "draft-at-risk"),
        getStatusConditionArtifactKey(HIGHLIGHT_VIEW_ID, machineRule.id),
        getStatusConditionArtifactKey(
          `__board-setup-draft__anywhere:${machineRule.id}`,
          machineRule.id,
        ),
      ].sort(),
    );
  });

  it("finds the attributes shared by a status's token types", () => {
    expect(
      getSharedAttributes(sdcpn, [...machineTracked]).map(
        (attribute) => attribute.name,
      ),
    ).toEqual(["machine_id", "machine_damage_ratio"]);
  });
});

describe("saved highlights", () => {
  const view = { identityRef: "identity" };

  it("round-trips a rule through a saved highlight", () => {
    const original = rule({ checks: "also", alsoPlaceIds: ["b"] });
    const [highlight] = highlightsFromRules([original], labels, tracked);
    expect(highlight).toMatchObject({
      id: "rule-1",
      statusLabelRef: "producing",
      places: ["p", "b"],
      tokenCondition: "token.machine_damage_ratio >= 0.8",
      icon: "warning",
    });
    expect(ruleFromHighlight(highlight!, labels, tracked)).toEqual(original);
  });

  it("reads anywhere and raw expressions back", () => {
    const back = ruleFromHighlight(
      {
        id: "h",
        name: "Odd",
        displayColor: "#000",
        statusLabelRef: "producing",
        places: ["a", "p", "b", "r"],
        tokenCondition: "token.a > 1 && token.b < 2",
      },
      labels,
      tracked,
    );
    expect(back.checks).toBe("anywhere");
    expect(back.expression).toBe("token.a > 1 && token.b < 2");
    expect(back.icon).toBeNull();
    expect(highlightsAsView([], view.identityRef).labels).toEqual([]);
  });

  it("moves a rule before another so it wins", () => {
    const rules = [rule({ id: "x" }), rule({ id: "y" }), rule({ id: "z" })];
    expect(moveRuleBefore(rules, "z", "x").map((r) => r.id)).toEqual([
      "z",
      "x",
      "y",
    ]);
  });
});

describe("card fields", () => {
  it("picks the first number every tracked type carries", () => {
    const sdcpn = productionMachines.petriNetDefinition;
    const statusView = sdcpn.statusViews![0]!;
    const machineTracked = new Set(
      statusView.labels.flatMap((label) => label.places),
    );
    const options = getCardFieldOptions(
      sdcpn,
      machineTracked,
      statusView.identityRef,
    );
    expect(options.map((option) => option.name)).toEqual([
      "machine_damage_ratio",
      "transformation_progress",
    ]);
    expect(getDefaultCardFields(options)).toEqual(["machine_damage_ratio"]);
  });

  it("formats field names and values for a card", () => {
    expect(humanizeField("machine_damage_ratio", "Machine")).toBe(
      "damage ratio",
    );
    expect(formatFieldValue(0.8612)).toBe("0.86");
    expect(formatFieldValue(3)).toBe("3");
    expect(formatFieldValue(undefined)).toBe("—");
  });
});
