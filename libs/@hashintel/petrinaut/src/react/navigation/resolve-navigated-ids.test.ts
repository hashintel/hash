import { describe, expect, it } from "vitest";

import { generateArcId, toPetrinautId } from "@hashintel/petrinaut-core";

import {
  resolveNavigatedId,
  resolveNavigatedItems,
} from "./resolve-navigated-ids";

const placeId = toPetrinautId("place__queue");
const arcId = generateArcId({
  inputId: `place:${placeId}`,
  outputId: toPetrinautId("transition__serve"),
});

const getItemType = (id: string) =>
  id === placeId ? "place" : id === arcId ? "arc" : null;

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

const resolve = (
  location: Partial<Parameters<typeof resolveNavigatedItems>[0]>,
) =>
  resolveNavigatedItems(
    { simulateResource: null, selection: [], ...location },
    definition,
    getItemType,
  );

describe("resolveNavigatedId", () => {
  it("resolves an id to the converted id the items hold", () => {
    expect(resolveNavigatedId(definition.scenarios, "baseline")).toBe(
      toPetrinautId("baseline"),
    );
    expect(resolveNavigatedId(definition.scenarios, "missing")).toBeNull();
  });
});

describe("resolveNavigatedItems", () => {
  it("converts place and arc ids, and drops items the net lacks", () => {
    expect(
      resolve({
        selection: [
          { type: "place", id: "place__queue" },
          {
            type: "arc",
            id: generateArcId({
              inputId: "place:place__queue",
              outputId: "transition__serve",
            }),
          },
          { type: "transition", id: "place__queue" },
        ],
      }).selection,
    ).toEqual([
      { type: "place", id: placeId },
      { type: "arc", id: arcId },
    ]);
  });

  it("keeps an item that resolves as written by identity", () => {
    const item = { type: "place", id: placeId } as const;

    expect(resolve({ selection: [item] }).selection[0]).toBe(item);
  });

  it("resolves the scenario resource and drops a missing metric", () => {
    expect(
      resolve({ simulateResource: { type: "scenario", id: "baseline" } })
        .simulateResource,
    ).toEqual({ type: "scenario", id: toPetrinautId("baseline") });
    expect(
      resolve({ simulateResource: { type: "metric", id: "throughput" } })
        .simulateResource,
    ).toBeNull();
  });

  it("keeps an experiment resource, which is not part of the document", () => {
    const resource = { type: "experiment", id: "experiment-1" } as const;

    expect(resolve({ simulateResource: resource }).simulateResource).toBe(
      resource,
    );
  });
});
