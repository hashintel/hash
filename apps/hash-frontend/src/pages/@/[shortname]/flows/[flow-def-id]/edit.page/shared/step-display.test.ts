import { describe, expect, it } from "vitest";

import {
  getStepDisplay,
  isAddableAction,
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

  it("lists the upcoming actions without making them addable", () => {
    expect(
      labelsOf(
        listedActionGroups
          .flatMap(({ actions }) => actions)
          .filter((action) => !isAddableAction(action)),
      ),
    ).toEqual(["Ask a person", "Send email", "For each"]);
  });
});

describe("getStepDisplay", () => {
  it("shows a step in its group's hue, and an AI step in pink in any group", () => {
    const displayOf = (actionDefinitionId: string) =>
      getStepDisplay({
        kind: "action",
        stepId: "1",
        actionDefinitionId,
        description: "",
        inputs: {},
      });

    expect(displayOf("filterList")).toMatchObject({
      group: "Lists",
      tone: "purple",
    });
    expect(displayOf("draftMessage")).toMatchObject({
      group: "Messages",
      tone: "pink",
    });
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
