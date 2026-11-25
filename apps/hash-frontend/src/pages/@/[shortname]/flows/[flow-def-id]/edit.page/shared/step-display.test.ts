import { describe, expect, it } from "vitest";

import {
  listedActionGroups,
  recommendedActions,
  searchListedActions,
} from "./step-display";

const labelsOf = (actions: { label: string }[]) =>
  actions.map(({ label }) => label);

describe("listedActionGroups", () => {
  it("lists every group with its actions, in order", () => {
    expect(
      listedActionGroups.map(({ label, actions }) => [
        label,
        labelsOf(actions),
      ]),
    ).toEqual([
      ["People", ["Ask a person"]],
      ["Messages", ["Send email", "Draft email"]],
      ["Documents", ["Fetch file"]],
      ["Entities", ["Find entities", "Create entity", "Update entity"]],
      ["Lists", ["Filter list", "Find", "Order by", "Take first", "Aggregate"]],
      ["Flow control", ["If", "For each"]],
    ]);
  });
});

describe("searchListedActions", () => {
  it("matches the names people see, ignoring case and surrounding spaces", () => {
    expect(labelsOf(searchListedActions("  FETCH "))).toEqual(["Fetch file"]);
    /* The engine calls these Query Entities and Get File From URL. */
    expect(searchListedActions("query")).toEqual([]);
    expect(searchListedActions("get file")).toEqual([]);
  });

  it("matches anywhere in a name", () => {
    expect(labelsOf(searchListedActions("entity"))).toEqual([
      "Create entity",
      "Update entity",
    ]);
  });

  it("lists matches in the order of their groups, not by name", () => {
    expect(labelsOf(searchListedActions("f"))).toEqual([
      "Draft email",
      "Fetch file",
      "Find entities",
      "Filter list",
      "Find",
      "Take first",
      "If",
      "For each",
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
