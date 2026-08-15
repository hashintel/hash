import { describe, expect, it } from "vitest";

import { enumerateWeightedMarkingIndicesGenerator } from "../simulation/engine/enumerate-weighted-markings";
import {
  emitPairScanWgsl,
  pairCount,
  rankPair,
  selectFiringPair,
  unrankPair,
} from "./pair-selection";

/** The engine's own pair order for one place, as the CPU would walk it. */
function cpuPairs(tokenCount: number): [number, number][] {
  return [
    ...enumerateWeightedMarkingIndicesGenerator([
      { count: tokenCount, weight: 2 },
    ]),
  ].map((combination) => {
    const [pair] = combination;
    return [pair![0]!, pair![1]!] as [number, number];
  });
}

/**
 * Deterministic pseudo-random predicate, so a failure is reproducible.
 *
 * Modular arithmetic rather than the usual xor-shift mixing, because the lint
 * bans bitwise operators; the quality only has to be enough to scatter passes
 * across the pair space.
 */
function makePredicate(seed: number): (i: number, j: number) => boolean {
  return (i, j) => {
    const mixed =
      (seed * 1_103_515_245 + i * 12_347 + j * 6_781) % 2_147_483_647;
    return mixed % 5 === 0;
  };
}

describe("unrankPair", () => {
  it("reproduces the engine's pair order exactly", () => {
    // The whole scheme rests on this: the CPU fires on the *first* passing
    // combination, so an ordering that merely covers the same pairs is not
    // enough — index x must be the CPU's x-th pair.
    for (const n of [2, 3, 4, 5, 8, 17, 64]) {
      const expected = cpuPairs(n);
      expect(pairCount(n)).toBe(expected.length);

      const actual = Array.from({ length: pairCount(n) }, (_, x) =>
        unrankPair(x, n),
      );
      expect(actual).toStrictEqual(expected);
    }
  });

  it("has no pairs below two tokens", () => {
    expect(pairCount(0)).toBe(0);
    expect(pairCount(1)).toBe(0);
    expect(cpuPairs(1)).toStrictEqual([]);
  });

  it("round-trips against rankPair", () => {
    for (const n of [2, 7, 32, 256]) {
      for (let x = 0; x < pairCount(n); x++) {
        const [i, j] = unrankPair(x, n);
        expect(rankPair(i, j, n)).toBe(x);
      }
    }
  });

  it("stays exact in f32, which is all WGSL has", () => {
    // The closed form takes a square root. Simulating f32 rounding at every step
    // shows it is exact well past the 256-token ceiling the metric histogram
    // imposes; it first breaks at n = 5793.
    const f32 = Math.fround;
    const unrankF32 = (x: number, n: number): [number, number] => {
      const a = f32(2 * n - 1);
      const disc = f32(f32(a * a) - f32(8 * x));
      const i = Math.floor(f32(f32(a - f32(Math.sqrt(disc))) / 2));
      return [i, x - Math.floor((i * (2 * n - 1 - i)) / 2) + i + 1];
    };

    // Half a million `expect` calls cost seconds of harness time and made this
    // test flake on the shared 5s timeout, so mismatches are collected and
    // asserted once. Capped at a few so a systematic break stays readable.
    const mismatches: string[] = [];
    for (const n of [64, 256, 1024]) {
      for (let x = 0; x < pairCount(n) && mismatches.length < 4; x++) {
        const [i, j] = unrankF32(x, n);
        const [wantI, wantJ] = unrankPair(x, n);
        if (i !== wantI || j !== wantJ) {
          mismatches.push(
            `n=${n} x=${x}: f32 (${i},${j}) != (${wantI},${wantJ})`,
          );
        }
      }
    }

    expect(mismatches).toStrictEqual([]);
  });
});

describe("selectFiringPair", () => {
  it("picks the same pair the engine's loop would", () => {
    // Against the engine's enumerator directly: walk it in order, take the first
    // passing combination, and require the closed-form scan to agree.
    for (const n of [2, 3, 5, 9, 16, 33]) {
      for (let seed = 1; seed <= 40; seed++) {
        const passes = makePredicate(seed * 7 + n);
        const expected = cpuPairs(n).find(([i, j]) => passes(i, j)) ?? null;
        const actual = selectFiringPair(n, passes);

        if (expected === null) {
          expect(actual).toBeNull();
        } else {
          expect([actual?.i, actual?.j]).toStrictEqual(expected);
        }
      }
    }
  });

  it("takes the lowest index, not the largest lambda", () => {
    // The distinction that matters. Pair 0 is (0,1) and pair 5 is (1,4) for n=5;
    // a max-lambda rule would choose the later one, and consume different tokens.
    const passing = new Set(["0,1", "1,4"]);
    const chosen = selectFiringPair(5, (i, j) => passing.has(`${i},${j}`));

    expect(chosen).toStrictEqual({ index: 0, i: 0, j: 1 });
  });

  it("reports nothing firing rather than a fallback pair", () => {
    expect(selectFiringPair(8, () => false)).toBeNull();
    // And a place that cannot supply two tokens has nothing to scan.
    expect(selectFiringPair(1, () => true)).toBeNull();
  });
});

describe("emitPairScanWgsl", () => {
  const wgsl = (): string =>
    emitPairScanWgsl({
      tokenCountExpr: "counts[0u]",
      emitAccepts: (first, second) => ({
        statements: [`let d = distance(${first}, ${second});`],
        expression: "d < 1.0",
      }),
      firedVar: "fires",
      firstVar: "slot_a",
      secondVar: "slot_b",
    }).join("\n");

  it("stops at the first passing pair rather than reducing over all of them", () => {
    // A full min-reduction would visit every pair even when the first one fires,
    // and the CPU stops — so the emitted loop must break.
    expect(wgsl()).toMatch(/break;/);
  });

  it("places the acceptance statements inside the loop, per candidate", () => {
    // A compiled lambda hoists its subexpressions into `let`s that read the
    // candidate's attributes, so they must be re-evaluated for each pair rather
    // than lifted out of the loop.
    const emitted = wgsl();
    const loopIndex = emitted.indexOf("for (var x: u32 = 0u;");
    const statementIndex = emitted.indexOf("let d = distance(cand_i, cand_j);");

    expect(loopIndex).toBeGreaterThan(-1);
    expect(statementIndex).toBeGreaterThan(loopIndex);
  });

  it("records the chosen slots so the caller can consume them", () => {
    const emitted = wgsl();

    expect(emitted).toMatch(/slot_a = cand_i;/);
    expect(emitted).toMatch(/slot_b = cand_j;/);
  });

  it("guards the square root and the pair count against fewer than two tokens", () => {
    const emitted = wgsl();

    // `2n - 1` underflows u32 at n = 0, and the discriminant can go slightly
    // negative from f32 rounding at the last pair.
    expect(emitted).toMatch(
      /select\(0u, pair_n \* \(pair_n - 1u\) \/ 2u, pair_n >= 2u\)/,
    );
    expect(emitted).toMatch(/sqrt\(max\(disc, 0\.0\)\)/);
  });

  it("computes j in integer arithmetic, not through the f32 discriminant", () => {
    // Rounding `2n - 1` through f32 and back would be exact at our sizes but is
    // needless; j is exact integer work.
    const emitted = wgsl();

    expect(emitted).toMatch(/let pair_a_u = 2u \* pair_n - 1u;/);
    expect(emitted).toMatch(/pair_a_u - cand_i/);
  });
});
