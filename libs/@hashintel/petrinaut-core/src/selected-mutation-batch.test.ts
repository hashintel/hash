import { describe, expect, test, vi } from "vitest";

import {
  executeSelectedMutationBatch,
  selectedMutationBatchSchema,
} from "./selected-mutation-batch";

import type { AbortSignalLike } from "./environment";

const place = {
  id: "p1",
  name: "Queue",
  x: 0,
  y: 0,
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
};

const operation = (operationId: string, id: string) => ({
  operationId,
  type: "addPlace" as const,
  input: { ...place, id },
});

describe("selected mutation batch", () => {
  test("parses only selected operations with unique logical IDs", () => {
    expect(
      selectedMutationBatchSchema.parse([operation("op-1", "p1")]),
    ).toHaveLength(1);
    expect(
      selectedMutationBatchSchema.parse([
        {
          operationId: "remove",
          type: "removePlace",
          input: { placeId: "p1" },
        },
      ]),
    ).toHaveLength(1);
    expect(
      selectedMutationBatchSchema.parse([
        {
          operationId: "rename",
          type: "updatePlace",
          input: { placeId: "p1", update: { name: "Renamed" } },
        },
        {
          operationId: "code",
          type: "updateTransition",
          input: { transitionId: "t1", update: { lambdaCode: "return 1;" } },
        },
        {
          operationId: "weight",
          type: "updateArcWeight",
          input: {
            transitionId: "t1",
            arcDirection: "input",
            placeId: "p1",
            weight: 2,
          },
        },
        {
          operationId: "arc-type",
          type: "updateArcType",
          input: { transitionId: "t1", placeId: "p1", type: "inhibitor" },
        },
        {
          operationId: "type-name",
          type: "updateType",
          input: { typeId: "item", update: { name: "Lot" } },
        },
        {
          operationId: "field",
          type: "addTypeElement",
          input: {
            typeId: "item",
            element: { elementId: "age", name: "age", type: "real" },
          },
        },
        {
          operationId: "field-name",
          type: "updateTypeElement",
          input: {
            typeId: "item",
            elementId: "age",
            update: { name: "age_days" },
          },
        },
        {
          operationId: "parameter-name",
          type: "updateParameter",
          input: { parameterId: "rate", update: { variableName: "demand" } },
        },
        {
          operationId: "drop-type",
          type: "removeType",
          input: { typeId: "item" },
        },
        {
          operationId: "drop-field",
          type: "removeTypeElement",
          input: { typeId: "item", elementId: "age" },
        },
        {
          operationId: "drop-parameter",
          type: "removeParameter",
          input: { parameterId: "rate" },
        },
        {
          operationId: "drop-dynamics",
          type: "removeDifferentialEquation",
          input: { equationId: "decay" },
        },
      ]),
    ).toHaveLength(12);
    for (const type of ["updatePlacePosition", "updateTransitionPosition"]) {
      expect(() =>
        selectedMutationBatchSchema.parse([
          {
            operationId: type,
            type,
            input: {
              placeId: "p1",
              transitionId: "t1",
              position: { x: 0, y: 0 },
            },
          },
        ]),
      ).toThrow();
    }
    expect(
      selectedMutationBatchSchema.parse([
        {
          operationId: "type",
          type: "addType",
          input: {
            id: "item",
            name: "Item",
            iconSlug: "circle",
            displayColor: "#1E90FF",
            elements: [],
          },
        },
        {
          operationId: "parameter",
          type: "addParameter",
          input: {
            id: "rate",
            name: "Rate",
            variableName: "arrival_rate",
            type: "real",
            defaultValue: "1",
          },
        },
        {
          operationId: "dynamics",
          type: "addDifferentialEquation",
          input: {
            id: "decay",
            name: "Decay",
            colorId: "item",
            code: "return tokens.map(() => ({}));",
          },
        },
        {
          operationId: "repair-dynamics",
          type: "updateDifferentialEquation",
          input: {
            equationId: "decay",
            update: { code: "return tokens.map(() => ({}));" },
          },
        },
      ]),
    ).toHaveLength(4);
    for (const type of ["addScenario", "addMetric"] as const) {
      expect(() =>
        selectedMutationBatchSchema.parse([
          {
            operationId: type,
            type,
            input: {},
          },
        ]),
      ).toThrow();
    }
    expect(() =>
      selectedMutationBatchSchema.parse([
        operation("duplicate", "p1"),
        operation("duplicate", "p2"),
      ]),
    ).toThrow(/operationId must be unique/u);
  });

  test("keeps the applied prefix and identifies every unattempted intent", async () => {
    const apply = vi
      .fn()
      .mockResolvedValueOnce({
        status: "applied",
        preHash: "before-1",
        postHash: "after-1",
        effects: [
          {
            classification: "direct",
            path: "/places/0",
            kind: "created",
            after: place,
          },
        ],
      })
      .mockResolvedValueOnce({
        status: "failed",
        preHash: "after-1",
        postHash: "after-1",
        error: "duplicate",
      });
    const operations = [
      operation("add-p1", "p1"),
      operation("add-p2", "p2"),
      operation("add-p3", "p3"),
    ];

    const result = await executeSelectedMutationBatch(operations, apply);

    expect(result).toEqual([
      {
        index: 0,
        operationId: "add-p1",
        status: "applied",
        preHash: "before-1",
        postHash: "after-1",
        effects: [
          {
            classification: "direct",
            path: "/places/0",
            kind: "created",
            after: place,
          },
        ],
      },
      {
        index: 1,
        operationId: "add-p2",
        status: "failed",
        preHash: "after-1",
        postHash: "after-1",
        error: "duplicate",
      },
      { index: 2, operationId: "add-p3", status: "unattempted" },
    ]);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  test("marks the remaining operations unattempted when the signal is aborted", async () => {
    let aborted = false;
    const signal: AbortSignalLike = {
      get aborted() {
        return aborted;
      },
      addEventListener: () => {},
      removeEventListener: () => {},
    };
    const apply = vi.fn().mockImplementation(() => {
      aborted = true;
      return {
        status: "applied" as const,
        preHash: "before",
        postHash: "after",
        effects: [],
      };
    });
    const result = await executeSelectedMutationBatch(
      [operation("add-p1", "p1"), operation("add-p2", "p2")],
      apply,
      { signal },
    );
    expect(result.map(({ status }) => status)).toEqual([
      "applied",
      "unattempted",
    ]);
    expect(apply).toHaveBeenCalledTimes(1);
  });
});
