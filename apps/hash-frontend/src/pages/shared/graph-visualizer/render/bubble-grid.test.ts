/**
 * BubbleCellPacker tests: the R9 binning must be invisible. The field a
 * fragment computes from its cell's kernel copies has to equal the field
 * computed from the whole community, everywhere a fragment can run.
 *
 * The contract, per pixel:
 * - pixel inside an emitted cell → per-cell field == full-community field
 * (`evaluateBubbleField` is the oracle, mirroring the shader);
 * - pixel outside every emitted cell → the full field is zero there (so
 * never rendering those pixels changes nothing).
 */
import { describe, expect, it } from "vitest";

import { evaluateBubbleField } from "./bubble-corridors";
import { BUBBLE_TEX_WIDTH, BubbleCellPacker } from "./bubble-grid";
import {
  MAX_NODES_PER_COMMUNITY,
  MAX_SEGMENTS_PER_COMMUNITY,
} from "./gpu/bubble-set-sdf-layer";

import type { BubbleCellPack, BubbleCellPackResult } from "./bubble-grid";

const FIELD_RADIUS = 50;

interface Segment {
  readonly memberA: number;
  readonly memberB: number;
  readonly radius: number;
}

interface Community {
  readonly members: readonly (readonly [number, number])[];
  readonly segments: readonly Segment[];
  readonly color?: readonly [number, number, number, number];
  /** Point-kernel radius override (world units); defaults to {@link FIELD_RADIUS}. */
  readonly fieldRadius?: number;
}

/** Build a {@link BubbleCellPack} mirroring production layout: ranges, segment slots, and point texels in gather order. */
function makePack(communities: readonly Community[]): BubbleCellPack {
  const totalMembers = communities.reduce(
    (sum, community) => sum + community.members.length,
    0,
  );
  const totalSegments = communities.reduce(
    (sum, community) => sum + community.segments.length,
    0,
  );

  const ranges = new Float32Array(communities.length * 2);
  const colors = new Uint8Array(communities.length * 4);
  const fieldRadii = new Float32Array(communities.length);
  const pointTexels = new Float32Array(totalMembers * 4);
  const segmentSlots = new Int32Array(totalSegments * 2);
  const segmentRadius = new Float32Array(totalSegments);
  const segmentCounts = new Int32Array(communities.length);
  const segmentStorageOffsets = new Int32Array(communities.length);

  let pointOffset = 0;
  let segmentOffset = 0;
  for (const [ci, community] of communities.entries()) {
    ranges[ci * 2] = pointOffset;
    ranges[ci * 2 + 1] = community.members.length;

    const [red, green, blue, alpha] = community.color ?? [10, 20, 30, 40];
    colors[ci * 4] = red;
    colors[ci * 4 + 1] = green;
    colors[ci * 4 + 2] = blue;
    colors[ci * 4 + 3] = alpha;

    fieldRadii[ci] = community.fieldRadius ?? FIELD_RADIUS;
    for (const [member, [x, y]] of community.members.entries()) {
      pointTexels[(pointOffset + member) * 4] = x;
      pointTexels[(pointOffset + member) * 4 + 1] = y;
    }

    segmentStorageOffsets[ci] = segmentOffset;
    segmentCounts[ci] = community.segments.length;
    for (const [segmentIndex, segment] of community.segments.entries()) {
      segmentSlots[(segmentOffset + segmentIndex) * 2] =
        pointOffset + segment.memberA;
      segmentSlots[(segmentOffset + segmentIndex) * 2 + 1] =
        pointOffset + segment.memberB;
      segmentRadius[segmentOffset + segmentIndex] = segment.radius;
    }

    pointOffset += community.members.length;
    segmentOffset += community.segments.length;
  }

  return {
    keptCount: communities.length,
    ranges,
    pointTexels,
    colors,
    segmentSlots,
    segmentRadius,
    segmentCounts,
    segmentStorageOffsets,
    fieldRadii,
  };
}

/** Decode one packed cell back into oracle-shaped kernels. */
function cellKernels(packed: BubbleCellPackResult, cell: number) {
  const pointBase = packed.nodeRanges[cell * 2]!;
  const pointCount = packed.nodeRanges[cell * 2 + 1]!;
  const points: [number, number][] = [];
  for (let point = 0; point < pointCount; point++) {
    const texel = (pointBase + point) * 4;
    points.push([packed.texels[texel]!, packed.texels[texel + 1]!]);
  }
  const segmentBase = packed.segmentRanges[cell * 2]!;
  const segmentCount = packed.segmentRanges[cell * 2 + 1]!;
  const segments = [];
  for (let segment = 0; segment < segmentCount; segment++) {
    const texel = (segmentBase + segment * 2) * 4;
    segments.push({
      ax: packed.texels[texel]!,
      ay: packed.texels[texel + 1]!,
      radius: packed.texels[texel + 2]!,
      bx: packed.texels[texel + 4]!,
      by: packed.texels[texel + 5]!,
    });
  }
  return { points, segments };
}

/** Full-community kernels for the oracle, read back from the SAME float32 inputs. */
function communityKernels(pack: BubbleCellPack, ci: number) {
  const pointOffset = pack.ranges[ci * 2]!;
  const memberCount = pack.ranges[ci * 2 + 1]!;
  const points: [number, number][] = [];
  for (let member = 0; member < memberCount; member++) {
    const texel = (pointOffset + member) * 4;
    points.push([pack.pointTexels[texel]!, pack.pointTexels[texel + 1]!]);
  }
  const segments = [];
  const storageStart = pack.segmentStorageOffsets[ci]!;
  for (let segment = 0; segment < pack.segmentCounts[ci]!; segment++) {
    const storage = storageStart + segment;
    const slotA = pack.segmentSlots[storage * 2]!;
    const slotB = pack.segmentSlots[storage * 2 + 1]!;
    segments.push({
      ax: pack.pointTexels[slotA * 4]!,
      ay: pack.pointTexels[slotA * 4 + 1]!,
      bx: pack.pointTexels[slotB * 4]!,
      by: pack.pointTexels[slotB * 4 + 1]!,
      radius: pack.segmentRadius[storage]!,
    });
  }
  return { points, segments };
}

/**
 * The invisibility proof, brute-forced: rasterise each community's reachable
 * area; at every sample the per-cell field (what the shader would compute)
 * must equal the full field, and samples outside all cells must be zero.
 */
function expectFieldEquivalence(
  pack: BubbleCellPack,
  packed: BubbleCellPackResult,
  step = 7,
) {
  for (let ci = 0; ci < pack.keptCount; ci++) {
    const full = communityKernels(pack, ci);
    if (full.points.length === 0) {
      continue;
    }
    const fieldRadius = pack.fieldRadii[ci]!;
    const xs = full.points.map(([x]) => x);
    const ys = full.points.map(([, y]) => y);
    // Sample past the kernel reach so the "outside every cell" case is hit.
    const pad = fieldRadius * 2;
    const minX = Math.min(...xs) - pad;
    const maxX = Math.max(...xs) + pad;
    const minY = Math.min(...ys) - pad;
    const maxY = Math.max(...ys) + pad;

    // Identify packed cells for this community via matching alpha channel.
    const cells: number[] = [];
    for (let cell = 0; cell < packed.cellCount; cell++) {
      if (packed.colors[cell * 4 + 3] === pack.colors[ci * 4 + 3]) {
        cells.push(cell);
      }
    }

    let insideSamples = 0;
    let outsideNonZero = 0;
    for (let y = minY; y <= maxY; y += step) {
      for (let x = minX; x <= maxX; x += step) {
        const fullField = evaluateBubbleField(
          x,
          y,
          full.points,
          full.segments,
          fieldRadius,
        );
        const cell = cells.find((candidate) => {
          const bounds = packed.bounds.subarray(
            candidate * 4,
            candidate * 4 + 4,
          );
          return (
            x >= bounds[0]! &&
            x < bounds[2]! &&
            y >= bounds[1]! &&
            y < bounds[3]!
          );
        });
        if (cell === undefined) {
          if (fullField !== 0) {
            outsideNonZero += 1;
          }
          continue;
        }
        insideSamples += 1;
        const local = cellKernels(packed, cell);
        const cellField = evaluateBubbleField(
          x,
          y,
          local.points,
          local.segments,
          fieldRadius,
        );
        expect(Math.abs(cellField - fullField)).toBeLessThan(1e-9);
      }
    }
    expect(insideSamples).toBeGreaterThan(0);
    expect(outsideNonZero).toBe(0);
  }
}

/** A tight 4-node clump centred on (cx, cy). */
function clump(cx: number, cy: number): (readonly [number, number])[] {
  return [
    [cx - 15, cy - 12],
    [cx + 15, cy - 12],
    [cx - 15, cy + 12],
    [cx + 15, cy + 12],
  ];
}

describe("bubble grid packing, field equivalence", () => {
  it("single clump community: per-cell field matches the full field everywhere", () => {
    const pack = makePack([{ members: clump(0, 0), segments: [] }]);
    const packed = new BubbleCellPacker().pack(pack);

    expect(packed.cellCount).toBeGreaterThan(0);
    expectFieldEquivalence(pack, packed);
  });

  it("spread clumps with corridors (long diagonal capsules) stay exact", () => {
    const members = [...clump(0, 0), ...clump(620, 40), ...clump(300, 540)];
    const pack = makePack([
      {
        members,
        segments: [
          // Corridors like the planner emits: full width + one narrowed.
          { memberA: 1, memberB: 4, radius: 22 },
          { memberA: 2, memberB: 8, radius: 22 },
          { memberA: 5, memberB: 9, radius: 9.9 },
        ],
      },
    ]);
    const packed = new BubbleCellPacker().pack(pack);

    expectFieldEquivalence(pack, packed);
  });

  it("multiple communities pack disjoint instance/texel regions", () => {
    const pack = makePack([
      {
        members: clump(0, 0),
        segments: [{ memberA: 0, memberB: 3, radius: 22 }],
        color: [1, 2, 3, 100],
      },
      {
        members: clump(900, -300),
        segments: [{ memberA: 0, memberB: 2, radius: 22 }],
        color: [4, 5, 6, 200],
      },
    ]);
    const packed = new BubbleCellPacker().pack(pack);

    expectFieldEquivalence(pack, packed);

    // cellCount partitions cleanly by community colour.
    let first = 0;
    let second = 0;
    for (let cell = 0; cell < packed.cellCount; cell++) {
      const alpha = packed.colors[cell * 4 + 3];
      if (alpha === 100) {
        first += 1;
      } else if (alpha === 200) {
        second += 1;
      }
    }
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
    expect(first + second).toBe(packed.cellCount);
  });

  it("mixed per-community kernel radii stay exact and tag every cell", () => {
    // An oversampled community carries a larger adaptive radius; its grid is
    // coarser but the per-cell field must still match the full field, and
    // each cell must carry its own community's radius for the shader.
    const pack = makePack([
      {
        members: clump(0, 0),
        segments: [],
        color: [1, 2, 3, 100],
        fieldRadius: 130,
      },
      {
        members: clump(700, 100),
        segments: [{ memberA: 0, memberB: 3, radius: 22 }],
        color: [4, 5, 6, 200],
      },
    ]);
    const packed = new BubbleCellPacker().pack(pack);

    expectFieldEquivalence(pack, packed);

    for (let cell = 0; cell < packed.cellCount; cell++) {
      const alpha = packed.colors[cell * 4 + 3];
      expect(packed.fieldRadii[cell]).toBe(alpha === 100 ? 130 : FIELD_RADIUS);
    }
  });

  it("cells stay within the shader loop bounds", () => {
    // Worst plausible density: one community, the full sample cap in one spot.
    const members: (readonly [number, number])[] = [];
    for (let member = 0; member < MAX_NODES_PER_COMMUNITY; member++) {
      members.push([(member % 32) * 6, Math.floor(member / 32) * 6]);
    }
    const segments: Segment[] = [];
    for (let segment = 0; segment < 255; segment++) {
      segments.push({
        memberA: segment * 4,
        memberB: segment * 4 + 4,
        radius: 22,
      });
    }
    const pack = makePack([{ members, segments }]);
    const packed = new BubbleCellPacker().pack(pack);

    for (let cell = 0; cell < packed.cellCount; cell++) {
      expect(packed.nodeRanges[cell * 2 + 1]!).toBeLessThanOrEqual(
        MAX_NODES_PER_COMMUNITY,
      );
      expect(packed.segmentRanges[cell * 2 + 1]!).toBeLessThanOrEqual(
        MAX_SEGMENTS_PER_COMMUNITY,
      );
    }
    expectFieldEquivalence(pack, packed, 11);
  });
});

describe("bubble grid packing, reuse across frames", () => {
  it("is deterministic and reuses buffers on identical repacks", () => {
    const pack = makePack([
      {
        members: [...clump(0, 0), ...clump(500, 80)],
        segments: [{ memberA: 1, memberB: 4, radius: 22 }],
      },
    ]);
    const packer = new BubbleCellPacker();
    const first = packer.pack(pack);
    const firstSnapshot = {
      cellCount: first.cellCount,
      texHeight: first.texHeight,
      bounds: [...first.bounds.subarray(0, first.cellCount * 4)],
      nodeRanges: [...first.nodeRanges.subarray(0, first.cellCount * 2)],
      segmentRanges: [...first.segmentRanges.subarray(0, first.cellCount * 2)],
      texels: [...first.texels],
    };

    const second = packer.pack(pack);

    expect(second.cellCount).toBe(firstSnapshot.cellCount);
    expect(second.texHeight).toBe(firstSnapshot.texHeight);
    expect([...second.bounds.subarray(0, second.cellCount * 4)]).toEqual(
      firstSnapshot.bounds,
    );
    expect([...second.nodeRanges.subarray(0, second.cellCount * 2)]).toEqual(
      firstSnapshot.nodeRanges,
    );
    expect([...second.segmentRanges.subarray(0, second.cellCount * 2)]).toEqual(
      firstSnapshot.segmentRanges,
    );
    expect([...second.texels]).toEqual(firstSnapshot.texels);
  });

  it("texture height is monotone so occupancy jitter cannot thrash the texture", () => {
    const packer = new BubbleCellPacker();
    const big = packer.pack(
      makePack([
        {
          members: Array.from({ length: 120 }, (_, member) => [
            (member % 12) * 90,
            Math.floor(member / 12) * 90,
          ]),
          segments: [],
        },
      ]),
    );
    const small = packer.pack(
      makePack([{ members: clump(0, 0), segments: [] }]),
    );

    expect(small.texHeight).toBe(big.texHeight);
    expect(small.texels.length).toBe(BUBBLE_TEX_WIDTH * small.texHeight * 4);
  });
});
