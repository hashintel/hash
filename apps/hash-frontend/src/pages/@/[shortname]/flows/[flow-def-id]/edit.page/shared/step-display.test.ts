import { describe, expect, it } from "vitest";

import {
  addableActionGroups,
  recommendedActions,
  searchAddableActions,
} from "./step-display";

const labelsOf = (actions: { label: string }[]) =>
  actions.map(({ label }) => label);

describe("addableActionGroups", () => {
  it("lists the groups in order, leaving out People, which has no action that can be added yet", () => {
    expect(
      addableActionGroups.map(({ label, actions }) => [
        label,
        labelsOf(actions),
      ]),
    ).toEqual([
      ["Messages", ["Draft email"]],
      ["Documents", ["Fetch file"]],
      ["Entities", ["Find entities", "Create entity", "Update entity"]],
      ["Flow control", ["If", "Filter list"]],
    ]);
  });
});

describe("searchAddableActions", () => {
  it("matches the names people see, ignoring case and surrounding spaces", () => {
    expect(labelsOf(searchAddableActions("  FETCH "))).toEqual(["Fetch file"]);
    /* The engine calls these Query Entities and Get File From URL. */
    expect(searchAddableActions("query")).toEqual([]);
    expect(searchAddableActions("get file")).toEqual([]);
  });

  it("matches anywhere in a name", () => {
    expect(labelsOf(searchAddableActions("entity"))).toEqual([
      "Create entity",
      "Update entity",
    ]);
  });

  it("lists matches in the order of their groups, not by name", () => {
    expect(labelsOf(searchAddableActions("f"))).toEqual([
      "Draft email",
      "Fetch file",
      "Find entities",
      "If",
      "Filter list",
    ]);
  });
});

describe("recommendedActions", () => {
  it("lists the actions that can start a flow, in the order chosen", () => {
    expect(labelsOf(recommendedActions)).toEqual([
      "Find entities",
      "Fetch file",
      "Create entity",
    ]);
  });
});
