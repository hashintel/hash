/**
 * Choosing which pair of tokens a weight-2 typed arc consumes, on the GPU.
 *
 * The CPU walks `indexCombinations(n, 2)` — lexicographic `i < j` — and fires on
 * the **first** combination whose lambda clears the frame's acceptance test
 * (`monte-carlo/transition-effect.ts`). Two properties of that loop matter, and
 * both are easy to get wrong:
 *
 * 1. The uniform `u` is drawn **once**, before the loop, and reused for every
 *    combination. So the test is a single threshold applied to all pairs, and
 *    "does the transition fire at all" is a plain OR over pairs.
 * 2. Which pair fires is the **lowest-indexed** passing one, not the one with the
 *    largest lambda. With several pairs passing — routine for a collision model —
 *    picking the wrong one consumes different tokens and the trajectory diverges
 *    structurally, not by noise.
 *
 * So the GPU needs a flat scan over pairs with a min-index reduction, and its
 * pair ordering must be the CPU's exactly. Unranking through the combinatorial
 * number system gives that: pair index `x` maps to the `x`-th lexicographic
 * `i < j`, so scanning `x` ascending *is* the CPU's order.
 *
 * "The WebGPU backend" in
 * `libs/@local/petrinaut-arch-docs/content/simulation/performance.mdx` covers
 * why this is a flat scan rather than a nested loop: dynamic trip counts cost
 * the maximum across a SIMT subgroup, and unranking removes the nesting
 * entirely.
 */

/** Number of unordered pairs over `n` tokens. */
export function pairCount(n: number): number {
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

/**
 * The `x`-th unordered pair `(i, j)`, `i < j`, in lexicographic order.
 *
 * Closed form rather than a search, so a GPU invocation derives its own pair from
 * a flat index with no loop. Verified exact in f32 for every pair up to n = 4096
 * (first mismatch at n = 5793), which is far above the 256-token ceiling the
 * metric histogram imposes — see `pair-selection.test.ts`.
 */
export function unrankPair(x: number, n: number): [number, number] {
  const a = 2 * n - 1;
  const i = Math.floor((a - Math.sqrt(a * a - 8 * x)) / 2);
  const j = x - (i * (a - i)) / 2 + i + 1;
  return [i, j];
}

/** The flat index of pair `(i, j)`, inverse of {@link unrankPair}. */
export function rankPair(i: number, j: number, n: number): number {
  return (i * (2 * n - 1 - i)) / 2 + (j - i - 1);
}

/**
 * The pair the CPU would fire on: the lowest-indexed one that passes.
 *
 * `null` when none passes, which is the transition not firing this frame. The
 * reference implementation of what the emitted WGSL must compute — the tests
 * check it against the engine's own enumerator rather than against itself.
 */
export function selectFiringPair(
  tokenCount: number,
  passes: (i: number, j: number) => boolean,
): { index: number; i: number; j: number } | null {
  const total = pairCount(tokenCount);
  for (let x = 0; x < total; x++) {
    const [i, j] = unrankPair(x, tokenCount);
    if (passes(i, j)) {
      return { index: x, i, j };
    }
  }
  return null;
}

export type EmitPairScanOptions = {
  /** WGSL expression for the live token count of the place being paired over. */
  tokenCountExpr: string;
  /**
   * Emits the acceptance test for one candidate pair, given the WGSL variable
   * names holding its two token slot indices.
   *
   * Returns statements *and* an expression rather than just an expression,
   * because a compiled lambda hoists its subexpressions into `let` bindings that
   * read the candidate's attributes — those have to land inside the loop body.
   */
  emitAccepts: (
    firstVar: string,
    secondVar: string,
  ) => { statements: readonly string[]; expression: string };
  /** Existing `bool` set to true when a pair passes. */
  firedVar: string;
  /** Existing `u32`s the chosen slot indices are written to. */
  firstVar: string;
  secondVar: string;
  /** Indentation prefix for the emitted lines. */
  indent?: string;
};

/**
 * WGSL for a flat scan over pairs that stops at the lowest passing index.
 *
 * A serial scan inside one invocation rather than a parallel reduction across
 * invocations, because a run's whole state lives in one invocation's registers —
 * spreading a single transition's pair search across the workgroup would mean
 * sharing that state through memory, which is the round-trip the whole design
 * exists to avoid. Breaking at the first hit also makes the common case (an early
 * pair passes) cheap, where a full reduction would always pay for every pair.
 *
 * The caller declares `firedVar`, `firstVar` and `secondVar`: the chosen slots
 * are needed again by the compaction that follows, which sits outside the block
 * this emits.
 */
export function emitPairScanWgsl({
  tokenCountExpr,
  emitAccepts,
  firedVar,
  firstVar,
  secondVar,
  indent = "      ",
}: EmitPairScanOptions): string[] {
  const lines: string[] = [];
  const push = (line: string) => lines.push(`${indent}${line}`);

  push(`{`);
  push(`  let pair_n = ${tokenCountExpr};`);
  push(
    `  let pair_total = select(0u, pair_n * (pair_n - 1u) / 2u, pair_n >= 2u);`,
  );
  // `2n - 1` in both forms: f32 for the discriminant, u32 for the exact integer
  // arithmetic of `j`, so neither has to round-trip through the other.
  push(`  let pair_a_u = 2u * pair_n - 1u;`);
  push(`  let pair_a = f32(pair_a_u);`);
  push(`  for (var x: u32 = 0u; x < pair_total; x = x + 1u) {`);
  // Unranked per iteration rather than kept as a running (i, j): the closed form
  // is a handful of ALU ops, and carrying state would make an early `break`
  // leave the pair variables inconsistent.
  push(`    let disc = pair_a * pair_a - 8.0 * f32(x);`);
  push(`    let cand_i = u32(floor((pair_a - sqrt(max(disc, 0.0))) * 0.5));`);
  push(
    `    let cand_j = x - (cand_i * (pair_a_u - cand_i)) / 2u + cand_i + 1u;`,
  );

  const accepts = emitAccepts("cand_i", "cand_j");
  for (const statement of accepts.statements) {
    push(`    ${statement}`);
  }
  push(`    ${firedVar} = ${accepts.expression};`);
  // The CPU takes the first passing combination, so stop here rather than
  // continuing and keeping a minimum.
  push(`    if (${firedVar}) {`);
  push(`      ${firstVar} = cand_i;`);
  push(`      ${secondVar} = cand_j;`);
  push(`      break;`);
  push(`    }`);
  push(`  }`);
  push(`}`);

  return lines;
}
