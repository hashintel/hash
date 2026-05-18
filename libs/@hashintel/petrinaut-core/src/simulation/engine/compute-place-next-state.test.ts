/* eslint-disable @typescript-eslint/no-shadow */
import { expect, it } from "vitest";

import type { PlaceDifferentialEquation } from "./compute-place-next-state";
import { computePlaceNextState } from "./compute-place-next-state";

it("executes without errors", () => {
  // GIVEN
  const dimensions = 2;
  const numberOfTokens = 2;

  const initialState = Float64Array.from([
    [1, 2],
    [3, 4],
  ]);

  const differentialEquation: PlaceDifferentialEquation = (
    _state,
    dimensions,
    numberOfTokens,
  ) => {
    return new Float64Array(dimensions * numberOfTokens).fill(1);
  };

  const dt = 0.1;

  // WHEN
  const nextState = computePlaceNextState(
    initialState,
    dimensions,
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
  const dimensions = 2;
  const numberOfTokens = 2;

  const initialState = Float64Array.from([
    [1, 2],
    [3, 4],
  ]);

  const differentialEquation: PlaceDifferentialEquation = (
    _state,
    dimensions,
    numberOfTokens,
  ) => {
    return new Float64Array(dimensions * numberOfTokens).fill(1);
  };

  const dt = 0.5;

  // WHEN
  const nextState = computePlaceNextState(
    initialState,
    dimensions,
    numberOfTokens,
    differentialEquation,
    "euler",
    dt,
  );

  // THEN
  expect(nextState).toEqual(
    Float64Array.from([
      [1.5, 2.5],
      [3.5, 4.5],
    ]),
  );
});
