import { describe, expect, it } from "vitest";

import {
  arealSpacingWorld,
  blendSpacing,
  COMPACT_OPACITY_DENSE,
  COMPACT_OPACITY_SPARSE,
  countPointsInRect,
  DENSITY_DENSE_SPACING_PX,
  DENSITY_MAX_RADIUS_PX,
  DENSITY_MIN_RADIUS_PX,
  DENSITY_SPACING_FRACTION,
  DENSITY_SPARSE_SPACING_PX,
  densityPointRadiusPx,
  maxDensityOpacity,
  medianNearestNeighbourWorld,
  minimumNearestNeighbourWorld,
} from "./node-density";

import type { NetworkGraphPoint } from "./network-graph-util";

const point = (x: number, y: number, id: number): NetworkGraphPoint => ({
  id,
  x,
  y,
  color: "#000000",
});

/** A `size × size` square lattice, `spacing` world units apart. */
const lattice = (size: number, spacing: number): NetworkGraphPoint[] => {
  const points: NetworkGraphPoint[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      points.push(point(col * spacing, row * spacing, row * size + col));
    }
  }
  return points;
};

describe("medianNearestNeighbourWorld", () => {
  it("returns null with fewer than two nodes", () => {
    expect(medianNearestNeighbourWorld([])).toBeNull();
    expect(medianNearestNeighbourWorld([point(0, 0, 0)])).toBeNull();
  });

  it("returns null when all nodes are coincident", () => {
    expect(
      medianNearestNeighbourWorld([point(5, 5, 0), point(5, 5, 1)]),
    ).toBeNull();
  });

  it("recovers the spacing of a regular lattice", () => {
    // Every lattice node's nearest neighbour is one grid step away.
    expect(medianNearestNeighbourWorld(lattice(4, 10))).toBe(10);
    expect(medianNearestNeighbourWorld(lattice(6, 3))).toBe(3);
  });

  it("takes the median over a mixed set", () => {
    // NN distances: 3, 3, ~12.2 → median 3.
    const points = [point(0, 0, 0), point(0, 3, 1), point(10, 10, 2)];
    expect(medianNearestNeighbourWorld(points)).toBe(3);
  });

  it("reports a larger spacing for a sparser set", () => {
    const dense = medianNearestNeighbourWorld(lattice(5, 2));
    const sparse = medianNearestNeighbourWorld(lattice(5, 40));
    expect(dense).not.toBeNull();
    expect(sparse).not.toBeNull();
    expect(sparse!).toBeGreaterThan(dense!);
  });
});

describe("minimumNearestNeighbourWorld", () => {
  it("returns null with fewer than two nodes", () => {
    expect(minimumNearestNeighbourWorld([])).toBeNull();
    expect(minimumNearestNeighbourWorld([point(0, 0, 0)])).toBeNull();
  });

  it("returns null when every node is coincident", () => {
    // Zoom can never separate a coincident stack, so there is no resolvable
    // pair to measure.
    expect(
      minimumNearestNeighbourWorld([point(5, 5, 0), point(5, 5, 1)]),
    ).toBeNull();
  });

  it("ignores coincident pairs: the minimum is the closest resolvable pair", () => {
    // The coincident stack at (15, 15) collapses to one representative; the
    // minimum is its √50 gap to the nearest lattice node, not 0.
    const points = [...lattice(4, 10), point(15, 15, 100), point(15, 15, 101)];
    expect(minimumNearestNeighbourWorld(points)).toBeCloseTo(Math.sqrt(50), 10);
  });

  it("recovers the spacing of a regular lattice", () => {
    expect(minimumNearestNeighbourWorld(lattice(4, 10))).toBe(10);
    expect(minimumNearestNeighbourWorld(lattice(6, 3))).toBe(3);
  });

  it("finds one tight pair hidden in a sparse lattice", () => {
    // The median barely moves, but the minimum is the tight pair's distance —
    // the pair a strided sample could miss.
    const points = [...lattice(8, 50), point(201, 201, 200)];
    // (201, 201) sits √2 from the lattice node at (200, 200).
    expect(minimumNearestNeighbourWorld(points)).toBeCloseTo(Math.SQRT2, 10);
  });

  it("is at most the median spacing", () => {
    const points = [point(0, 0, 0), point(0, 3, 1), point(10, 10, 2)];
    expect(minimumNearestNeighbourWorld(points)!).toBeLessThanOrEqual(
      medianNearestNeighbourWorld(points)!,
    );
  });
});

describe("densityPointRadiusPx", () => {
  it("caps sparse viewports at the max radius", () => {
    expect(densityPointRadiusPx(1_000, 1)).toBe(DENSITY_MAX_RADIUS_PX);
  });

  it("floors dense viewports at the min radius", () => {
    expect(densityPointRadiusPx(0.1, 1)).toBe(DENSITY_MIN_RADIUS_PX);
  });

  it("scales with on-screen spacing between the clamps", () => {
    const spacing = 10;
    const scale = 1;
    const expected = DENSITY_SPACING_FRACTION * spacing * scale;
    expect(expected).toBeGreaterThan(DENSITY_MIN_RADIUS_PX);
    expect(expected).toBeLessThan(DENSITY_MAX_RADIUS_PX);
    expect(densityPointRadiusPx(spacing, scale)).toBeCloseTo(expected);
    // Zooming in (larger scale) grows the radius proportionally.
    expect(densityPointRadiusPx(spacing, scale * 2)).toBeCloseTo(expected * 2);
  });
});

describe("maxDensityOpacity", () => {
  it("sits at the sparse opacity for low max density (wide spacing)", () => {
    expect(maxDensityOpacity(DENSITY_SPARSE_SPACING_PX, 1)).toBeCloseTo(
      COMPACT_OPACITY_SPARSE,
    );
    expect(maxDensityOpacity(1_000, 1)).toBeCloseTo(COMPACT_OPACITY_SPARSE);
  });

  it("bottoms out at the dense opacity for high max density (tight spacing)", () => {
    expect(maxDensityOpacity(DENSITY_DENSE_SPACING_PX, 1)).toBeCloseTo(
      COMPACT_OPACITY_DENSE,
    );
    expect(maxDensityOpacity(0, 1)).toBeCloseTo(COMPACT_OPACITY_DENSE);
  });

  it("falls back to the sparse opacity when the measure is unavailable", () => {
    expect(maxDensityOpacity(null, 1)).toBe(COMPACT_OPACITY_SPARSE);
  });

  it("interpolates linearly at the midpoint of the band", () => {
    const midSpacing =
      (DENSITY_DENSE_SPACING_PX + DENSITY_SPARSE_SPACING_PX) / 2;
    expect(maxDensityOpacity(midSpacing, 1)).toBeCloseTo(
      (COMPACT_OPACITY_DENSE + COMPACT_OPACITY_SPARSE) / 2,
    );
  });

  it("moves monotonically toward the sparse opacity as spacing widens (density drops)", () => {
    const opacities = [4, 8, 12, 16, 20, 24].map((spacing) =>
      maxDensityOpacity(spacing, 1),
    );
    for (let index = 1; index < opacities.length; index += 1) {
      expect(opacities[index]!).toBeGreaterThan(opacities[index - 1]!);
    }
  });

  it("responds to on-screen spacing, so a smaller scale reads as denser", () => {
    // Halving the world→pixel scale halves the on-screen spacing (denser), so a layout
    // at the sparse spacing drops below the sparse opacity once zoomed out.
    expect(maxDensityOpacity(DENSITY_SPARSE_SPACING_PX, 0.5)).toBeLessThan(
      COMPACT_OPACITY_SPARSE,
    );
  });
});

describe("countPointsInRect", () => {
  const points = [
    point(0, 0, 0),
    point(5, 5, 1),
    point(10, 10, 2),
    point(-5, 0, 3),
  ];

  it("counts only points inside the rectangle (inclusive of edges)", () => {
    expect(countPointsInRect(points, 0, 0, 10, 10)).toBe(3);
    expect(countPointsInRect(points, 1, 1, 9, 9)).toBe(1);
    expect(countPointsInRect(points, -10, -10, 10, 10)).toBe(4);
    expect(countPointsInRect(points, 100, 100, 200, 200)).toBe(0);
  });
});

describe("arealSpacingWorld", () => {
  it("returns null below two nodes", () => {
    expect(arealSpacingWorld(0, 100)).toBeNull();
    expect(arealSpacingWorld(1, 100)).toBeNull();
  });

  it("is the even-spread spacing over the area", () => {
    // 100 nodes over a 100x100 area → one per 100 area units → spacing 10.
    expect(arealSpacingWorld(100, 100 * 100)).toBe(10);
  });

  it("ignores clumping: fewer nodes over the same area means larger spacing", () => {
    const dense = arealSpacingWorld(400, 10_000);
    const sparse = arealSpacingWorld(25, 10_000);
    expect(sparse!).toBeGreaterThan(dense!);
  });
});

describe("blendSpacing", () => {
  it("returns pure nearest-neighbour at weight 0 and pure areal at weight 1", () => {
    expect(blendSpacing(4, 24, 0)).toBe(4);
    expect(blendSpacing(4, 24, 1)).toBe(24);
  });

  it("averages the two at weight 0.5", () => {
    expect(blendSpacing(4, 24, 0.5)).toBe(14);
  });

  it("interpolates linearly by weight", () => {
    expect(blendSpacing(0, 100, 0.25)).toBe(25);
    expect(blendSpacing(0, 100, 0.75)).toBe(75);
  });

  it("clamps the weight to [0, 1]", () => {
    expect(blendSpacing(4, 24, -1)).toBe(4);
    expect(blendSpacing(4, 24, 2)).toBe(24);
  });

  it("uses whichever measure is available when the other is null", () => {
    expect(blendSpacing(null, 24, 0.5)).toBe(24);
    expect(blendSpacing(4, null, 0.5)).toBe(4);
    expect(blendSpacing(null, null, 0.5)).toBeNull();
  });
});
