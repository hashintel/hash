/**
 * Community sub-clustering hot path (runs when a large type-set cluster is
 * opened in hierarchical mode). Splits the pipeline into its three stages so the
 * cost of the CSR build (array-of-arrays + `{neighbor, weight}` object per edge),
 * the BFS components pass, and the label-propagation inner loop (a fresh `Map`
 * per node per iteration, up to 20 iterations) can each be attributed.
 *
 * Run: `cd apps/hash-frontend && ../../node_modules/.bin/vitest bench --run \
 *   src/pages/shared/graph-visualizer-2/worker/hierarchy/community.bench.ts`
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { buildCommunityInputs } from "../bench-fixtures";
import { buildInducedCsr, connectedComponents } from "../csr-graph";
import { boundedLabelPropagation } from "./community";

import type { GraphShape } from "../bench-fixtures";

interface Case {
  readonly label: string;
  readonly shape: GraphShape;
}

const CASES: readonly Case[] = [
  {
    label: "small (2k nodes / 6k links)",
    shape: {
      nodeCount: 2_000,
      linkCount: 6_000,
      typeCount: 8,
      hubCount: 30,
      rootFraction: 1,
      seed: 11,
    },
  },
  {
    label: "medium (8k nodes / 24k links)",
    shape: {
      nodeCount: 8_000,
      linkCount: 24_000,
      typeCount: 8,
      hubCount: 60,
      rootFraction: 1,
      seed: 12,
    },
  },
  {
    label: "large (20k nodes / 60k links)",
    shape: {
      nodeCount: 20_000,
      linkCount: 60_000,
      typeCount: 8,
      hubCount: 120,
      rootFraction: 1,
      seed: 13,
    },
  },
];

for (const { label, shape } of CASES) {
  // Inputs are built once and only READ by the pipeline, so they can be shared
  // across iterations. buildInducedCsr allocates fresh output every call.
  const { entityIdxs, links } = buildCommunityInputs(shape);
  const csr = buildInducedCsr(entityIdxs, links);
  const components = connectedComponents(csr);
  const largestComponent = components.reduce(
    (best, component) => (component.length > best.length ? component : best),
    components[0] ?? [],
  );

  describe(`community detection: ${label}`, () => {
    bench("buildInducedCsr", () => {
      buildInducedCsr(entityIdxs, links);
    });

    bench("connectedComponents", () => {
      connectedComponents(csr);
    });

    bench("boundedLabelPropagation (largest component)", () => {
      boundedLabelPropagation(csr, largestComponent);
    });

    bench("full: CSR + components + label propagation", () => {
      const freshCsr = buildInducedCsr(entityIdxs, links);
      for (const component of connectedComponents(freshCsr)) {
        boundedLabelPropagation(freshCsr, component);
      }
    });
  });
}
