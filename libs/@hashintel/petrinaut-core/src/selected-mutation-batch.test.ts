import { describe, expect, test, vi } from "vitest";

import {
  executeSelectedMutationBatch,
  selectedMutationBatchSchema,
} from "./selected-mutation-batch";

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
    expect(() =>
      selectedMutationBatchSchema.parse([
        {
          operationId: "update",
          type: "updatePlace",
          input: { placeId: "p1", update: { name: "Renamed" } },
        },
      ]),
    ).toThrow();
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
});
