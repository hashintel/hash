import { describe, expect, it } from "vitest";

import { materializeEngineFrame } from "../frames/internal-frame";
import { removeTokensFromSimulationFrame as removeTokensFromEngineFrame } from "./remove-tokens-from-simulation-frame";
import {
  decodePlaceTokens,
  makeTestFrame,
  realElements,
  type TestFrame,
} from "./token-layout.test-helpers";

import type { TokenRecord } from "../../types/sdcpn";
import type { EngineFrameSnapshot } from "../frames/internal-frame";
import type { EngineFrame } from "./types";

function removeTokensFromSimulationFrame(
  frame: TestFrame,
  tokensToRemove: Map<string, Set<number> | number>,
): {
  frame: EngineFrame;
  snapshot: EngineFrameSnapshot;
  decode: (placeId: string) => TokenRecord[];
} {
  const result = removeTokensFromEngineFrame(
    frame,
    tokensToRemove,
    frame.layout,
  );
  return {
    frame: result,
    snapshot: materializeEngineFrame(frame.layout, result),
    decode: (placeId) => decodePlaceTokens(frame.layout, result, placeId),
  };
}

describe("removeTokensFromSimulationFrame", () => {
  it("throws error when place ID is not found", () => {
    const frame = makeTestFrame({ places: {} });

    expect(() => {
      removeTokensFromSimulationFrame(
        frame,
        new Map([["nonexistent", new Set([0])]]),
      );
    }).toThrow("Place with ID nonexistent not found");
  });

  it("returns frame unchanged when tokens map is empty", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0", "d1"),
          tokens: [
            { d0: 1, d1: 2 },
            { d0: 3, d1: 4 },
            { d0: 5, d1: 6 },
          ],
        },
      },
    });

    const result = removeTokensFromEngineFrame(frame, new Map(), frame.layout);

    expect(result).toBe(frame);
  });

  it("throws error when token index is out of bounds", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }],
        },
      },
    });

    expect(() => {
      removeTokensFromSimulationFrame(frame, new Map([["p1", new Set([3])]]));
    }).toThrow("Invalid token index 3 for place p1. Place has 2 tokens.");
  });

  it("returns frame unchanged when place has empty set of indices", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }, { d0: 3 }],
        },
      },
    });

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set<number>()]]),
    );

    expect(result.decode("p1")).toEqual([{ d0: 1 }, { d0: 2 }, { d0: 3 }]);
    expect(result.snapshot.places.p1?.count).toBe(3);
  });

  it("removes a single token from a place with one attribute", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }, { d0: 3 }],
        },
      },
    });

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([1])]]),
    );

    expect(result.decode("p1")).toEqual([{ d0: 1 }, { d0: 3 }]);
    expect(result.snapshot.places.p1?.count).toBe(2);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
  });

  it("removes multiple tokens from a place with one attribute", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }, { d0: 3 }, { d0: 4 }],
        },
      },
    });

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([0, 2])]]),
    );

    expect(result.decode("p1")).toEqual([{ d0: 2 }, { d0: 4 }]);
    expect(result.snapshot.places.p1?.count).toBe(2);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
  });

  it("removes tokens from a place with multi-attribute tokens", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0", "d1", "d2"),
          tokens: [
            { d0: 1, d1: 2, d2: 3 },
            { d0: 4, d1: 5, d2: 6 },
            { d0: 7, d1: 8, d2: 9 },
          ],
        },
      },
    });

    // Remove token at index 1 (middle token: {4,5,6})
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([1])]]),
    );

    expect(result.decode("p1")).toEqual([
      { d0: 1, d1: 2, d2: 3 },
      { d0: 7, d1: 8, d2: 9 },
    ]);
    expect(result.snapshot.places.p1?.count).toBe(2);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
  });

  it("adjusts byte offsets for subsequent places after removal", () => {
    const frame = makeTestFrame({
      places: {
        // 2 tokens with stride 16 bytes → p2 starts at byte offset 32
        p1: {
          elements: realElements("d0", "d1"),
          tokens: [
            { d0: 1, d1: 2 },
            { d0: 3, d1: 4 },
          ],
        },
        p2: {
          elements: realElements("d0"),
          tokens: [{ d0: 5 }, { d0: 6 }, { d0: 7 }],
        },
      },
    });

    // Remove one token from p1
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([0])]]),
    );

    // Expected: p1: [{3,4}]  |  p2: [{5}], [{6}], [{7}]
    expect(result.decode("p1")).toEqual([{ d0: 3, d1: 4 }]);
    expect(result.decode("p2")).toEqual([{ d0: 5 }, { d0: 6 }, { d0: 7 }]);
    expect(result.snapshot.places.p1?.count).toBe(1);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
    // p2's byte offset should be adjusted from 32 to 16 (removed one
    // 16-byte token)
    expect(result.snapshot.places.p2?.byteOffset).toBe(16);
    expect(result.snapshot.places.p2?.count).toBe(3);
  });

  it("removes all tokens from a place", () => {
    const frame = makeTestFrame({
      places: {
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }],
        },
        p2: {
          elements: realElements("d0"),
          tokens: [{ d0: 3 }, { d0: 4 }],
        },
      },
    });

    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p1", new Set([0, 1])]]),
    );

    expect(result.decode("p1")).toEqual([]);
    expect(result.decode("p2")).toEqual([{ d0: 3 }, { d0: 4 }]);
    expect(result.snapshot.places.p1?.count).toBe(0);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
    expect(result.snapshot.places.p2?.byteOffset).toBe(0);
    expect(result.snapshot.places.p2?.count).toBe(2);
  });

  it("handles removal from middle place with three places", () => {
    const frame = makeTestFrame({
      places: {
        // Stride 8 bytes each: p1 @ 0, p2 @ 16, p3 @ 40
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }],
        },
        p2: {
          elements: realElements("d0"),
          tokens: [{ d0: 3 }, { d0: 4 }, { d0: 5 }],
        },
        p3: {
          elements: realElements("d0"),
          tokens: [{ d0: 6 }, { d0: 7 }],
        },
      },
    });

    // Remove one token from p2 (middle place)
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([["p2", new Set([1])]]),
    );

    // Expected: p1: [{1}, {2}] | p2: [{3}, {5}] | p3: [{6}, {7}]
    expect(result.decode("p1")).toEqual([{ d0: 1 }, { d0: 2 }]);
    expect(result.decode("p2")).toEqual([{ d0: 3 }, { d0: 5 }]);
    expect(result.decode("p3")).toEqual([{ d0: 6 }, { d0: 7 }]);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
    expect(result.snapshot.places.p1?.count).toBe(2);
    expect(result.snapshot.places.p2?.byteOffset).toBe(16);
    expect(result.snapshot.places.p2?.count).toBe(2);
    // p3's byte offset should be adjusted from 40 to 32 (removed one
    // 8-byte token)
    expect(result.snapshot.places.p3?.byteOffset).toBe(32);
    expect(result.snapshot.places.p3?.count).toBe(2);
  });

  it("removes tokens from multiple places simultaneously", () => {
    const frame = makeTestFrame({
      places: {
        // p1 @ 0 (stride 8), p2 @ 24 (stride 16), p3 @ 56 (stride 8)
        p1: {
          elements: realElements("d0"),
          tokens: [{ d0: 1 }, { d0: 2 }, { d0: 3 }],
        },
        p2: {
          elements: realElements("d0", "d1"),
          tokens: [
            { d0: 4, d1: 5 },
            { d0: 6, d1: 7 },
          ],
        },
        p3: {
          elements: realElements("d0"),
          tokens: [{ d0: 8 }, { d0: 9 }],
        },
      },
    });

    // Remove tokens from multiple places: token 1 from p1, token 0 from p2,
    // token 1 from p3
    const result = removeTokensFromSimulationFrame(
      frame,
      new Map([
        ["p1", new Set([1])],
        ["p2", new Set([0])],
        ["p3", new Set([1])],
      ]),
    );

    // Expected: p1: [{1}, {3}] | p2: [{6,7}] | p3: [{8}]
    expect(result.decode("p1")).toEqual([{ d0: 1 }, { d0: 3 }]);
    expect(result.decode("p2")).toEqual([{ d0: 6, d1: 7 }]);
    expect(result.decode("p3")).toEqual([{ d0: 8 }]);
    expect(result.snapshot.places.p1?.count).toBe(2);
    expect(result.snapshot.places.p1?.byteOffset).toBe(0);
    expect(result.snapshot.places.p2?.count).toBe(1);
    expect(result.snapshot.places.p2?.byteOffset).toBe(16);
    expect(result.snapshot.places.p3?.count).toBe(1);
    expect(result.snapshot.places.p3?.byteOffset).toBe(32);
  });
});
