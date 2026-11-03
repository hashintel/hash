import { describe, expect, it } from "vitest";

import {
  addTerm,
  composableEquations,
  describeEquationForm,
  moveTerm,
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
      { id: "orbit", name: "Orbit", colorId: "sat", code: "" },
      { id: "pull", name: "Pull", colorId: "sat", code: "", arity: 2 },
      { id: "lift", name: "Lift", colorId: "sat", code: "", arity: 1 },
      { id: "other", name: "Other", colorId: "rock", code: "" },
    ];
    const place = {
      colorId: "sat",
      differentialEquationId: "orbit",
      dynamics: [{ differentialEquationId: "pull" }],
    };
    expect(composableEquations(place, equations).map(({ id }) => id)).toEqual([
      "lift",
    ]);
    expect(composableEquations({ ...place, colorId: null }, equations)).toEqual(
      [],
    );
  });

  it("describes the form an equation sees tokens in", () => {
    expect(describeEquationForm({})).toBe("Whole place");
    expect(describeEquationForm({ arity: 1 })).toBe("1 token");
    expect(describeEquationForm({ arity: 2 })).toBe("2 tokens");
  });
});
