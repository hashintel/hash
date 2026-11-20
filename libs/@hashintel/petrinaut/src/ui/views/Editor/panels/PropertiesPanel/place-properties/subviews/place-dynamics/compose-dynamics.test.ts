import { describe, expect, it } from "vitest";

import {
  moveTerm,
  placeTypeChange,
  removeTerm,
  termKeys,
} from "./compose-dynamics";

import type { PlaceDynamicsTerm } from "@hashintel/petrinaut-core";

const terms: PlaceDynamicsTerm[] = [
  { differentialEquationId: "pull" },
  { differentialEquationId: "drag" },
  { differentialEquationId: "spin" },
];

describe("compose-dynamics", () => {
  it("removes the term at an index", () => {
    expect(removeTerm(terms, 1)).toEqual([terms[0], terms[2]]);
  });

  it("moves a term to a position and refuses to leave the list", () => {
    expect(moveTerm(terms, 1, 0)).toEqual([terms[1], terms[0], terms[2]]);
    expect(moveTerm(terms, 0, 2)).toEqual([terms[1], terms[2], terms[0]]);
    expect(moveTerm(terms, 0, -1)).toEqual(terms);
    expect(moveTerm(terms, 2, 3)).toEqual(terms);
  });

  it("keys a repeated equation by its occurrence", () => {
    expect(termKeys([terms[0]!, terms[1]!, terms[0]!])).toEqual([
      "pull#0",
      "drag#0",
      "pull#1",
    ]);
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
