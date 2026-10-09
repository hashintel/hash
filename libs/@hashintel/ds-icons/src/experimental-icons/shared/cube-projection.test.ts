import { describe, expect, it } from "vitest";

import { projectCube } from "./cube-projection";

describe("subnet cube projection", () => {
  it("removes the three edges meeting at the rear corner", () => {
    expect(
      projectCube(35)
        .filter((edge) => !edge.visible)
        .map((edge) => edge.index),
    ).toEqual([1, 2, 10]);
    expect(
      projectCube(125)
        .filter((edge) => !edge.visible)
        .map((edge) => edge.index),
    ).toEqual([5, 6, 10]);
  });

  it("keeps a full turn within the icon grid and never reveals rear edges", () => {
    for (let angle = 0; angle <= 360; angle++) {
      const edges = projectCube(angle);
      expect(edges.filter((edge) => edge.visible)).toHaveLength(
        angle % 90 === 0 ? 7 : 9,
      );
      for (const edge of edges) {
        const coordinates =
          edge.path.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
        expect(coordinates).toHaveLength(4);
        expect(
          coordinates.every(
            (coordinate) => coordinate >= 2 && coordinate <= 22,
          ),
        ).toBe(true);
      }
    }
  });

  it("returns to the same projected shape after a full turn", () => {
    expect(projectCube(395)).toEqual(projectCube(35));
  });
});
