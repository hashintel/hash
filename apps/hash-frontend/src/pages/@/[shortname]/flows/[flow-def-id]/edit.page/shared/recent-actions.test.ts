import { describe, expect, it } from "vitest";

import { addRecentAction, getRecentActions } from "./recent-actions";

const recentIds = (stored: string | null) =>
  getRecentActions(stored).map(({ actionDefinitionId }) => actionDefinitionId);

describe("getRecentActions", () => {
  it("ignores storage that isn't a list of action ids", () => {
    expect(recentIds(null)).toEqual([]);
    expect(recentIds("not json")).toEqual([]);
    expect(recentIds('{"queryEntities":true}')).toEqual([]);
  });

  it("keeps the 3 newest actions that can still be added, skipping the rest", () => {
    expect(
      recentIds(
        JSON.stringify([
          1,
          "queryEntities",
          "noLongerOffered",
          "if",
          "filterList",
          "createEntity",
        ]),
      ),
    ).toEqual(["queryEntities", "if", "filterList"]);
  });
});

describe("addRecentAction", () => {
  const stored = JSON.stringify(["queryEntities", "if", "filterList"]);

  it("puts the added action first, without repeating it", () => {
    expect(JSON.parse(addRecentAction(stored, "if"))).toEqual([
      "if",
      "queryEntities",
      "filterList",
    ]);
  });

  it("drops the oldest action past 3", () => {
    expect(JSON.parse(addRecentAction(stored, "createEntity"))).toEqual([
      "createEntity",
      "queryEntities",
      "if",
    ]);
  });

  it("starts a list when nothing is stored", () => {
    expect(JSON.parse(addRecentAction(null, "draftMessage"))).toEqual([
      "draftMessage",
    ]);
  });
});
