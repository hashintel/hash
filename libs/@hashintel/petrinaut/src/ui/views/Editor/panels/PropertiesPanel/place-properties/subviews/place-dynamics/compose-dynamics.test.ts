import { describe, expect, it } from "vitest";

import {
  addTerm,
  composableEquations,
  describeEquationForm,
  moveTerm,
  placeTypeChange,
  removeTerm,
} from "./compose-dynamics";

import type {
  DifferentialEquation,
  PlaceDynamicsTerm,
} from "@hashintel/petrinaut-core";

const terms: PlaceDynamicsTerm[] = [
  { differentialEquationId: "pull" },
  { differentialEquationId: "drag" },
  { differentialEquationId: "spin" },
];

describe("compose-dynamics", () => {
  it("adds a term at the end", () => {
    expect(addTerm(terms, "lift")).toEqual([
      ...terms,
      { differentialEquationId: "lift" },
    ]);
  });

  it("removes the term at an index", () => {
    expect(removeTerm(terms, 1)).toEqual([terms[0], terms[2]]);
  });

  it("swaps a term with its neighbour and refuses to leave the list", () => {
    expect(moveTerm(terms, 1, -1)).toEqual([terms[1], terms[0], terms[2]]);
    expect(moveTerm(terms, 1, 1)).toEqual([terms[0], terms[2], terms[1]]);
    expect(moveTerm(terms, 0, -1)).toEqual(terms);
    expect(moveTerm(terms, 2, 1)).toEqual(terms);
  });

  it("offers the colour's equations the place does not compose yet", () => {
    const equations: DifferentialEquation[] = [
      { id: "orbit", name: "Orbit", colorId: "sat", code: "", arity: 1 },
      { id: "pull", name: "Pull", colorId: "sat", code: "", arity: 2 },
      { id: "lift", name: "Lift", colorId: "sat", code: "", arity: 1 },
      { id: "other", name: "Other", colorId: "rock", code: "", arity: 1 },
    ];
    const place = {
      colorId: "sat",
      dynamics: [
        { differentialEquationId: "orbit" },
        { differentialEquationId: "pull" },
      ],
    };
    expect(composableEquations(place, equations).map(({ id }) => id)).toEqual([
      "lift",
    ]);
    expect(composableEquations({ ...place, colorId: null }, equations)).toEqual(
      [],
    );
  });

  it("describes how many tokens an equation couples", () => {
    expect(describeEquationForm({ arity: 1 })).toBe("1 token");
    expect(describeEquationForm({ arity: 2 })).toBe("2 tokens");
  });

  it("clears the composed equations and switches dynamics off when the type changes", () => {
    const place = { colorId: "sat" };
    expect(placeTypeChange(place, "rock")).toEqual({
      colorId: "rock",
      dynamicsEnabled: false,
      dynamics: [],
    });
    expect(placeTypeChange(place, null)).toEqual({
      colorId: null,
      dynamicsEnabled: false,
      dynamics: [],
    });
    expect(placeTypeChange(place, "sat")).toBeNull();
  });
});
