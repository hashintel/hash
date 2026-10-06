import { describe, expect, it } from "vitest";

import { generateArcId, toPetrinautId } from "@hashintel/petrinaut-core";

import {
  resolveNavigatedId,
  resolveNavigatedItems,
  resolveNavigatedSelectionItem,
} from "./resolve-navigated-ids";

const placeId = toPetrinautId("place__queue");
const transitionId = toPetrinautId("transition__serve");
const arcId = generateArcId({ inputId: placeId, outputId: transitionId });

const getItemType = (id: string) =>
  id === placeId ? "place" : id === arcId ? "arc" : null;

describe("resolveNavigatedId", () => {
  const items = [{ id: toPetrinautId("baseline") }, { id: "custom" }];

  it("keeps an id the items hold as written", () => {
    expect(resolveNavigatedId(items, "custom")).toBe("custom");
  });

  it("resolves an id from before conversion to the converted id", () => {
    expect(resolveNavigatedId(items, "baseline")).toBe(
      toPetrinautId("baseline"),
    );
  });

  it("returns null for an id the items lack in either form", () => {
    expect(resolveNavigatedId(items, "missing")).toBeNull();
    expect(resolveNavigatedId(undefined, "baseline")).toBeNull();
  });
});

describe("resolveNavigatedSelectionItem", () => {
  it("keeps an item that resolves as written by identity", () => {
    const item = { type: "place", id: placeId } as const;

    expect(resolveNavigatedSelectionItem(item, getItemType)).toBe(item);
  });

  it("resolves place and arc ids from before conversion", () => {
    expect(
      resolveNavigatedSelectionItem(
        { type: "place", id: "place__queue" },
        getItemType,
      ),
    ).toEqual({ type: "place", id: placeId });
    expect(
      resolveNavigatedSelectionItem(
        {
          type: "arc",
          id: generateArcId({
            inputId: "place__queue",
            outputId: "transition__serve",
          }),
        },
        getItemType,
      ),
    ).toEqual({ type: "arc", id: arcId });
  });

  it("drops an item whose converted id names another kind of item", () => {
    expect(
      resolveNavigatedSelectionItem(
        { type: "transition", id: "place__queue" },
        getItemType,
      ),
    ).toBeNull();
  });
});

describe("resolveNavigatedItems", () => {
  const definition = {
    scenarios: [
      {
        id: toPetrinautId("baseline"),
        name: "Baseline",
        scenarioParameters: [],
        parameterOverrides: {},
        initialState: { type: "per_place" as const, content: {} },
      },
    ],
    metrics: [],
  };

  it("resolves the scenario resource and drops a missing metric", () => {
    expect(
      resolveNavigatedItems(
        {
          simulateResource: { type: "scenario", id: "baseline" },
          selection: [],
        },
        definition,
        getItemType,
      ).simulateResource,
    ).toEqual({ type: "scenario", id: toPetrinautId("baseline") });
    expect(
      resolveNavigatedItems(
        {
          simulateResource: { type: "metric", id: "throughput" },
          selection: [],
        },
        definition,
        getItemType,
      ).simulateResource,
    ).toBeNull();
  });

  it("keeps an experiment resource, which is not part of the document", () => {
    const resource = { type: "experiment", id: "experiment-1" } as const;

    expect(
      resolveNavigatedItems(
        { simulateResource: resource, selection: [] },
        definition,
        getItemType,
      ).simulateResource,
    ).toBe(resource);
  });
});
