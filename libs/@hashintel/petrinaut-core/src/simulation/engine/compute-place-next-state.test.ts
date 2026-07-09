import { expect, it } from "vitest";

import { computePlaceNextState } from "./compute-place-next-state";
import { computeTokenSlotLayout } from "./token-layout";
import {
  buildTokenBytes,
  decodeTokenBlock,
  realElements,
  type ColorElement,
} from "./token-layout.test-helpers";

import type { TokenRecord } from "../../types/sdcpn";
import type { PlaceDifferentialEquation } from "./compute-place-next-state";

function decodeTokens(
  elements: readonly ColorElement[],
  placeBytes: Uint8Array,
  numberOfTokens: number,
): TokenRecord[] {
  const layout = computeTokenSlotLayout(elements);
  return Array.from({ length: numberOfTokens }, (_, tokenIndex) =>
    decodeTokenBlock(
      elements,
      placeBytes.subarray(
        tokenIndex * layout.strideBytes,
        (tokenIndex + 1) * layout.strideBytes,
      ),
    ),
  );
}

it("executes without errors", () => {
  // GIVEN
  const elements = realElements("x", "y");
  const layout = computeTokenSlotLayout(elements);
  const numberOfTokens = 2;

  const initialState = buildTokenBytes(layout, [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);

  const differentialEquation: PlaceDifferentialEquation = (
    _state,
    tokenCount,
  ) => {
    return new Float64Array(
      layout.realFieldF64Offsets.length * tokenCount,
    ).fill(1);
  };

  const dt = 0.1;

  // WHEN
  const nextState = computePlaceNextState(
    initialState,
    layout,
    numberOfTokens,
    differentialEquation,
    "euler",
    dt,
  );

  // THEN
  expect(nextState).toBeDefined();
});

it("adds derivative to current state value", () => {
  // GIVEN
  const elements = realElements("x", "y");
  const layout = computeTokenSlotLayout(elements);
  const numberOfTokens = 2;

  const initialState = buildTokenBytes(layout, [
    { x: 1, y: 2 },
    { x: 3, y: 4 },
  ]);

  const differentialEquation: PlaceDifferentialEquation = (
    _state,
    tokenCount,
  ) => {
    return new Float64Array(
      layout.realFieldF64Offsets.length * tokenCount,
    ).fill(1);
  };

  const dt = 0.5;

  // WHEN
  const nextState = computePlaceNextState(
    initialState,
    layout,
    numberOfTokens,
    differentialEquation,
    "euler",
    dt,
  );

  // THEN
  expect(decodeTokens(elements, nextState, numberOfTokens)).toEqual([
    { x: 1.5, y: 2.5 },
    { x: 3.5, y: 4.5 },
  ]);
});

it("leaves discrete fields untouched while integrating real fields", () => {
  // GIVEN a colour mixing real, integer, and boolean elements
  const elements: ColorElement[] = [
    { elementId: "amount", name: "amount", type: "real" },
    { elementId: "count", name: "count", type: "integer" },
    { elementId: "active", name: "active", type: "boolean" },
  ];
  const layout = computeTokenSlotLayout(elements);
  const numberOfTokens = 1;

  const initialState = buildTokenBytes(layout, [
    { amount: 1, count: 3, active: true },
  ]);

  const differentialEquation: PlaceDifferentialEquation = (
    _state,
    tokenCount,
  ) => {
    return new Float64Array(
      layout.realFieldF64Offsets.length * tokenCount,
    ).fill(1);
  };

  const dt = 0.5;

  // WHEN
  const nextState = computePlaceNextState(
    initialState,
    layout,
    numberOfTokens,
    differentialEquation,
    "euler",
    dt,
  );

  // THEN only the real field is integrated; discrete fields pass through
  expect(decodeTokens(elements, nextState, numberOfTokens)).toEqual([
    { amount: 1.5, count: 3, active: true },
  ]);
});
