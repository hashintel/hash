/**
 * Shared-buffer write + growth costs. Two things matter here: the per-commit
 * cost of writing an entire flat-tier buffer (position + radius + colour +
 * entityIdx for every node, which `#writeFlatStyle` / `#buildFlatRenderEdges`
 * pay on every commit) and the cost of GROWING a GPU buffer, which is always a
 * re-allocate + full memcpy because `FlatGraphBuffer` is non-resizable.
 *
 * The three flat-buffer cases quantify that growth: `presized` is the floor,
 * `geometric` mirrors production (`flatCapacityFor` in core/graph-worker.ts
 * over-allocates 1.5x so growth is amortized), and `fixed-step` is the naive
 * grow-to-exact-count path production deliberately avoids -- the gap between the
 * last two is the payoff of the 1.5x slack, and the reason a test should lock it in.
 *
 * Run: `cd apps/hash-frontend && ../../node_modules/.bin/vitest bench --run \
 * src/pages/shared/graph-visualizer-2/worker/buffers/growable-buffer.bench.ts`
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { Column } from "../collections/column";
import { EntityPositionBuffer, FlatGraphBuffer } from "./position-buffer";

import type { RepublishHandler } from "./growable-buffer";

const SIZES: readonly number[] = [1_000, 10_000, 50_000];

const RGBA: readonly [number, number, number, number] = [10, 20, 30, 255];

const noopRepublish: RepublishHandler = () => {
  // The benchmark discards the re-published buffer; only the copy cost matters.
};

/** Write a full set of `count` records (the shape of a flat-tier commit). */
function writeAllRecords(buffer: FlatGraphBuffer, count: number): void {
  for (let index = 0; index < count; index++) {
    buffer.setPosition(index, index * 1.5, index * 0.5);
    buffer.setRadius(index, 4);
    buffer.setColor(index, RGBA);
    buffer.setEntityIdx(index, index);
  }
  buffer.setCount(count);
  buffer.commit();
}

/** Mirrors `flatCapacityFor` in core/graph-worker.ts (1.5x geometric slack). */
function flatCapacityFor(count: number): number {
  return Math.max(count + 64, Math.ceil(count * 1.5));
}

for (const size of SIZES) {
  describe(`flat buffer (${size} nodes)`, () => {
    // Buffer sized up front: the steady-state per-commit write, no growth.
    bench("presized: write all records + commit", () => {
      const buffer = new FlatGraphBuffer(size, noopRepublish);
      writeAllRecords(buffer, size);
    });

    // Production path: grow with 1.5x geometric slack, so the number of
    // re-allocations is O(log N) and total copied bytes stay O(N).
    bench("geometric growth (1.5x, production path)", () => {
      const buffer = new FlatGraphBuffer(1_024, noopRepublish);
      let capacity = 1_024;
      while (capacity < size) {
        capacity = flatCapacityFor(capacity);
        buffer.ensureCapacity(capacity);
      }
      writeAllRecords(buffer, size);
    });

    // Naive path production avoids: grow to the exact live count in 1024-record
    // steps, so every step re-allocates + memcpies the whole buffer -> O(N^2).
    bench("fixed-step growth (1024, naive)", () => {
      const buffer = new FlatGraphBuffer(1_024, noopRepublish);
      for (let filled = 1_024; filled < size; filled += 1_024) {
        buffer.ensureCapacity(Math.min(size, filled + 1_024));
      }
      writeAllRecords(buffer, size);
    });
  });

  describe(`leaf position buffer (${size} nodes)`, () => {
    // Per-tick position write for a settling leaf layout: this runs every frame.
    bench("setPosition x N + commit", () => {
      const buffer = new EntityPositionBuffer(size);
      for (let index = 0; index < size; index++) {
        buffer.setPosition(index, index * 1.5, index * 0.5);
      }
      buffer.commit();
    });
  });

  describe(`column growth (${size} pushes)`, () => {
    // Geometric-growth push path (entity/link columns, adjacency-free).
    bench("Column<Float32Array>.push from 1024", () => {
      const column = new Column(Float32Array, 1_024);
      for (let index = 0; index < size; index++) {
        column.push(index * 0.25);
      }
    });
  });
}
