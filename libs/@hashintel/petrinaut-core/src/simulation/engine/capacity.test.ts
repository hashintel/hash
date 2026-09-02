import { describe, expect, it } from "vitest";

import {
  computeTransitionCapacityConstraints,
  createPlaceCapacities,
  hasAnyPlaceCapacity,
  hasCapacityHeadroom,
  PLACE_CAPACITY_UNBOUNDED,
} from "./capacity";

import type { Transition } from "../../types/sdcpn";

const placeIndexById = new Map([
  ["a", 0],
  ["b", 1],
  ["c", 2],
]);

function transition(
  overrides: Partial<Pick<Transition, "inputArcs" | "outputArcs">>,
): Pick<Transition, "id" | "inputArcs" | "outputArcs"> {
  return {
    id: "t",
    inputArcs: [],
    outputArcs: [],
    ...overrides,
  };
}

describe("createPlaceCapacities", () => {
  it("treats absent, null and invalid capacities as unbounded", () => {
    const capacities = createPlaceCapacities([
      {},
      { capacity: null },
      { capacity: -1 },
      { capacity: 1.5 },
      { capacity: 0 },
      { capacity: 10 },
    ]);

    expect([...capacities]).toStrictEqual([
      PLACE_CAPACITY_UNBOUNDED,
      PLACE_CAPACITY_UNBOUNDED,
      PLACE_CAPACITY_UNBOUNDED,
      PLACE_CAPACITY_UNBOUNDED,
      // Zero is a real limit: the place can never hold a token.
      0,
      10,
    ]);
  });

  it("detects whether any place is bounded", () => {
    expect(hasAnyPlaceCapacity(createPlaceCapacities([{}, {}]))).toBe(false);
    expect(
      hasAnyPlaceCapacity(createPlaceCapacities([{}, { capacity: 3 }])),
    ).toBe(true);
  });
});

describe("computeTransitionCapacityConstraints", () => {
  const capacities = createPlaceCapacities([
    { capacity: 5 },
    {},
    { capacity: 2 },
  ]);

  it("constrains bounded output places by their arc weight", () => {
    const constraints = computeTransitionCapacityConstraints({
      transition: transition({ outputArcs: [{ placeId: "a", weight: 3 }] }),
      placeIndexById,
      placeCapacities: capacities,
    });

    expect(constraints).toStrictEqual([
      { placeIndex: 0, placeId: "a", delta: 3, capacity: 5 },
    ]);
  });

  it("ignores unbounded output places", () => {
    expect(
      computeTransitionCapacityConstraints({
        transition: transition({ outputArcs: [{ placeId: "b", weight: 9 }] }),
        placeIndexById,
        placeCapacities: capacities,
      }),
    ).toStrictEqual([]);
  });

  it("sums multiple output arcs into the same place", () => {
    const constraints = computeTransitionCapacityConstraints({
      transition: transition({
        outputArcs: [
          { placeId: "a", weight: 1 },
          { placeId: "a", weight: 2 },
        ],
      }),
      placeIndexById,
      placeCapacities: capacities,
    });

    expect(constraints).toStrictEqual([
      { placeIndex: 0, placeId: "a", delta: 3, capacity: 5 },
    ]);
  });

  it("nets standard input arcs against output arcs on the same place", () => {
    // Consumes 1 and produces 3, so a firing adds 2 on balance.
    const constraints = computeTransitionCapacityConstraints({
      transition: transition({
        inputArcs: [{ placeId: "a", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "a", weight: 3 }],
      }),
      placeIndexById,
      placeCapacities: capacities,
    });

    expect(constraints).toStrictEqual([
      { placeIndex: 0, placeId: "a", delta: 2, capacity: 5 },
    ]);
  });

  it("drops places a firing leaves no fuller", () => {
    // A 1-in/1-out self loop cannot overflow its own place, so a full place
    // must not block it.
    expect(
      computeTransitionCapacityConstraints({
        transition: transition({
          inputArcs: [{ placeId: "a", weight: 1, type: "standard" }],
          outputArcs: [{ placeId: "a", weight: 1 }],
        }),
        placeIndexById,
        placeCapacities: capacities,
      }),
    ).toStrictEqual([]);
  });

  it.each(["read", "inhibitor"] as const)(
    "does not offset output weight with a %s arc",
    (type) => {
      // Read and inhibitor arcs consume nothing, so they cannot make room.
      const constraints = computeTransitionCapacityConstraints({
        transition: transition({
          inputArcs: [{ placeId: "a", weight: 1, type }],
          outputArcs: [{ placeId: "a", weight: 1 }],
        }),
        placeIndexById,
        placeCapacities: capacities,
      });

      expect(constraints).toStrictEqual([
        { placeIndex: 0, placeId: "a", delta: 1, capacity: 5 },
      ]);
    },
  );
});

describe("hasCapacityHeadroom", () => {
  const constraints = [
    { placeIndex: 0, placeId: "a", delta: 2, capacity: 5 },
  ] as const;

  it("allows a firing that exactly fills the place", () => {
    expect(
      hasCapacityHeadroom(constraints, new Uint32Array([3, 0, 0]), null),
    ).toBe(true);
  });

  it("blocks a firing that would exceed the capacity", () => {
    expect(
      hasCapacityHeadroom(constraints, new Uint32Array([4, 0, 0]), null),
    ).toBe(false);
  });

  it("counts output already committed earlier in the same frame", () => {
    const counts = new Uint32Array([2, 0, 0]);

    expect(hasCapacityHeadroom(constraints, counts, null)).toBe(true);
    // Another transition has already produced 2 tokens this frame, so this
    // firing no longer fits even though the frame's counts still say 2.
    expect(
      hasCapacityHeadroom(constraints, counts, new Uint32Array([2, 0, 0])),
    ).toBe(false);
  });

  it("is vacuously true with no constraints", () => {
    expect(hasCapacityHeadroom([], new Uint32Array([9, 9, 9]), null)).toBe(
      true,
    );
  });
});
