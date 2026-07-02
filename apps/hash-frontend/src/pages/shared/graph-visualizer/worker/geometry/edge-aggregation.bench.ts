/**
 * Edge-aggregation pair keying. `makePairKey` allocates a template-string key
 * plus a result object for every cluster pair it classifies, and it runs inside
 * the aggregation loop on every structure commit (and the bezier build reads the
 * same pair keys per frame). Cluster-pair counts are far smaller than edge
 * counts, so this bench sizes that allocation cost against realistic pair counts.
 * This bench isolates makePairKey allocation only; full aggregator/bezier cost
 * needs a live cut + cluster tree (see the hierarchical case in
 * `core/commit-rebuild.bench.ts` for that path).
 *
 * Run: `cd apps/hash-frontend && ../../node_modules/.bin/vitest bench --run \
 * src/pages/shared/graph-visualizer/worker/geometry/edge-aggregation.bench.ts`
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { ClusterId } from "../../ids";
import { makePairKey } from "./edge-aggregation";

const PAIR_COUNTS: readonly number[] = [500, 2_000, 8_000];

/** A pool of cluster ids shaped like the real ones (`cluster:type:<key>`). */
function clusterIdPool(size: number): ClusterId[] {
  const pool: ClusterId[] = [];
  for (let index = 0; index < size; index++) {
    pool.push(ClusterId(`cluster:type:${index},${(index * 7) % 97}`));
  }
  return pool;
}

for (const pairCount of PAIR_COUNTS) {
  // A distinct (a, b) index pair per iteration of the inner loop, drawn from a
  // modest id pool so keys collide the way sibling cluster pairs do in practice.
  const pool = clusterIdPool(Math.max(32, Math.ceil(Math.sqrt(pairCount)) * 4));
  const pairs: [number, number][] = [];
  for (let index = 0; index < pairCount; index++) {
    const a = (index * 3) % pool.length;
    const b = (index * 5 + 1) % pool.length;
    pairs.push([a, b === a ? (b + 1) % pool.length : b]);
  }

  describe(`makePairKey (${pairCount} pairs)`, () => {
    bench("classify every pair", () => {
      let keyLengthSum = 0;
      for (const [a, b] of pairs) {
        keyLengthSum += makePairKey(pool[a]!, pool[b]!).key.length;
      }
      if (keyLengthSum < 0) {
        throw new Error("unreachable");
      }
    });
  });
}
