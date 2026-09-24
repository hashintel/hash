import { describe, expect, it } from "vitest";

import { composeLines, moduleFileStems } from "./python-layout";

describe("composeLines", () => {
  it("composes on one line while it fits, with the hidden variables last", () => {
    expect(composeLines(["a", "b"])).toEqual(["net = compose(a, b)"]);
    expect(composeLines(["a", "b"], ["clk_a"])).toEqual([
      "net = compose(a, b, hide={clk_a})",
    ]);
  });

  it("puts one argument per line past the line width, the hide set as the last one", () => {
    const instances = [
      "transition_Birth",
      "transition_Death",
      "place_Population",
    ];
    expect(composeLines(instances, ["clk_Birth", "clk_Death"])).toEqual([
      "net = compose(",
      "    transition_Birth,",
      "    transition_Death,",
      "    place_Population,",
      "    hide={clk_Birth, clk_Death},",
      ")",
    ]);
    expect(composeLines([...instances, "place_Graveyard_Of_Names"])).toEqual([
      "net = compose(",
      "    transition_Birth,",
      "    transition_Death,",
      "    place_Population,",
      "    place_Graveyard_Of_Names,",
      ")",
    ]);
  });
});

describe("moduleFileStems", () => {
  it("numbers a stem an earlier class already took", () => {
    expect([...moduleFileStems(["Place_Ab", "Place_AB", "Place_ab"])]).toEqual([
      ["Place_Ab", "place_ab"],
      ["Place_AB", "place_ab_2"],
      ["Place_ab", "place_ab_3"],
    ]);
  });
});
