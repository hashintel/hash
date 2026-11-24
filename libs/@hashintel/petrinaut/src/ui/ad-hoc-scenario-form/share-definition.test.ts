import { describe, expect, it } from "vitest";

import { applyAdHocAction } from "@hashintel/petrinaut-core";

import { shareContent } from "./share-definition";

import type {
  AdHocAction,
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";

const context: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-rate",
      name: "Rate",
      variableName: "rate",
      type: "real",
      defaultValue: "1.5",
    },
  ],
  places: [
    {
      id: "place-pumps",
      name: "Pumps",
      colorId: "colour-pump",
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-pump",
      name: "Pump",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "e1", name: "pressure", type: "real" },
        { elementId: "e2", name: "worn", type: "boolean" },
      ],
    },
  ],
};

/** A definition built anew on every call, as a host that materializes it does. */
const definition = (): AdHocScenarioState => ({
  variables: [
    { name: "base", type: "real", expression: "1", optimize: null },
    { name: "boost", type: "real", expression: "base * 2", optimize: null },
  ],
  netParameters: [
    { parameterId: "param-rate", expression: "2", optimize: null },
  ],
  places: {
    "place-pumps": {
      kind: "coloured",
      variables: [],
      rows: [
        {
          kind: "fixed",
          cells: [
            { expression: "3", optimize: null },
            { expression: "true", optimize: null },
          ],
        },
      ],
      sharedColumns: {},
    },
    "place-queue": {
      kind: "uncoloured",
      count: { expression: "4", optimize: null },
    },
  },
});

describe("shareContent", () => {
  it("returns the previous definition when the next one says the same", () => {
    const previous = definition();

    expect(shareContent(previous, previous)).toBe(previous);
    expect(shareContent(previous, definition())).toBe(previous);
  });

  it("returns the next definition when it shares all it can already", () => {
    const previous = definition();
    const edits: AdHocAction[] = [
      {
        type: "setExpression",
        target: { kind: "variable", placeId: null, index: 1 },
        expression: "base * 3",
      },
      {
        type: "setExpression",
        target: { kind: "netParameter", parameterId: "param-rate" },
        expression: "boost",
      },
      {
        type: "setExpression",
        target: { kind: "cell", placeId: "place-pumps", row: 0, column: 0 },
        expression: "5",
      },
      { type: "addVariable", placeId: null },
      { type: "addVariable", placeId: "place-pumps" },
      { type: "addTokenRow", placeId: "place-pumps" },
      {
        type: "toggleSelection",
        target: { kind: "variable", placeId: null, index: 0 },
        on: true,
      },
    ];

    for (const edit of edits) {
      const next = applyAdHocAction(previous, context, edit);
      expect(next, edit.type).not.toBe(previous);
      expect(shareContent(previous, next), edit.type).toBe(next);
    }
  });

  it("keeps every part the next definition leaves as it was", () => {
    const previous = definition();
    const next = definition();
    next.variables[1]!.expression = "base * 3";
    next.places["place-queue"] = {
      kind: "uncoloured",
      count: { expression: "5", optimize: null },
    };

    const shared = shareContent(previous, next);

    expect(shared).toEqual(next);
    expect(shared).not.toBe(next);
    expect(shared.variables[0]).toBe(previous.variables[0]);
    expect(shared.variables[1]).toBe(next.variables[1]);
    expect(shared.netParameters).toBe(previous.netParameters);
    expect(shared.places["place-pumps"]).toBe(previous.places["place-pumps"]);
    expect(shared.places["place-queue"]).toBe(next.places["place-queue"]);
  });

  it("takes a list that grew, shrank or changed its order as changed", () => {
    const previous = definition();
    const [base, boost] = previous.variables;

    const shorter = shareContent(previous, {
      ...definition(),
      variables: [definition().variables[0]!],
    });
    expect(shorter.variables).toHaveLength(1);
    expect(shorter.variables[0]).toBe(base);

    const swapped = shareContent(previous, {
      ...definition(),
      variables: definition().variables.reverse(),
    });
    expect(swapped.variables.map(({ name }) => name)).toEqual([
      "boost",
      "base",
    ]);
    expect(swapped.variables).not.toBe(previous.variables);
    expect(swapped.variables).not.toContain(base);
    expect(swapped.variables).not.toContain(boost);
  });

  it("takes places in another order as changed, and keeps each place", () => {
    const previous = definition();
    const { "place-pumps": pumps, "place-queue": queue } = definition().places;

    const shared = shareContent(previous, {
      ...definition(),
      places: { "place-queue": queue!, "place-pumps": pumps! },
    });

    expect(Object.keys(shared.places)).toEqual(["place-queue", "place-pumps"]);
    expect(shared.places["place-pumps"]).toBe(previous.places["place-pumps"]);
    expect(shared.places["place-queue"]).toBe(previous.places["place-queue"]);
  });
});
