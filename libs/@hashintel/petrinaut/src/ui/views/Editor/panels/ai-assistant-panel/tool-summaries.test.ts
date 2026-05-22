import { describe, expect, test } from "vitest";

import { summarizePetrinautAiToolCall } from "./tool-summaries";

import type { SDCPN } from "@hashintel/petrinaut-core";

const definition: SDCPN = {
  differentialEquations: [],
  parameters: [],
  places: [
    {
      colorId: null,
      differentialEquationId: null,
      dynamicsEnabled: false,
      id: "place__buffer",
      name: "Buffer",
      x: 0,
      y: 0,
    },
  ],
  transitions: [
    {
      id: "transition__ship",
      inputArcs: [],
      lambdaCode: "return true;",
      lambdaType: "predicate",
      name: "Ship",
      outputArcs: [],
      transitionKernelCode: "return tokens;",
      x: 0,
      y: 0,
    },
  ],
  types: [],
};

describe("summarizePetrinautAiToolCall", () => {
  test("falls back to existing entity names when updates omit names", () => {
    expect(
      summarizePetrinautAiToolCall(
        {
          input: {
            placeId: "place__buffer",
            update: { dynamicsEnabled: true },
          },
          toolName: "updatePlace",
        },
        { definition },
      ).title,
    ).toBe("Updated place Buffer");

    expect(
      summarizePetrinautAiToolCall(
        {
          input: {
            position: { x: 10, y: 20 },
            transitionId: "transition__ship",
          },
          toolName: "updateTransitionPosition",
        },
        { definition },
      ).title,
    ).toBe("Moved transition Ship");
  });

  test("prefers updated names while retaining previous names as detail", () => {
    expect(
      summarizePetrinautAiToolCall(
        {
          input: {
            placeId: "place__buffer",
            update: { name: "Queue" },
          },
          toolName: "updatePlace",
        },
        { definition },
      ),
    ).toMatchObject({
      detail: "Previous name: Buffer",
      title: "Updated place Queue",
    });
  });
});
