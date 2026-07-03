/**
 * End-to-end rebuild/redraw path: what `commitStructure` costs, driven through
 * the real {@link EntityGraphWorker} exactly as `entry.ts` does (ingest -> commit).
 *
 * Two questions:
 * - `no-op re-commit`: how much work does a commit do when nothing changed?
 * (`recomputeMode` + `#allNodeEntityIdxs` sort + topology rescan + `#writeFlatStyle`
 * + `#buildFlatRenderEdges`, or the hierarchical cut recompute + frame rebuild.)
 * A no-op should be near-free; anything else is per-commit waste on every batch.
 * - `bulk vs streaming`: the same final graph delivered as one batch+commit vs.
 * many batch+commits. The gap is the per-commit O(N) work (re)done per batch --
 * the streaming-ingest tax.
 *
 * The EntityGraphWorker runs its layout scheduler on MessageChannels; a synchronous
 * bench body never lets those macrotasks fire mid-measurement, and vitest tears
 * the process down after the run, so no scheduler cleanup is needed here.
 *
 * Run: `cd apps/hash-frontend && ../../node_modules/.bin/vitest bench --run \
 * src/pages/shared/graph-visualizer/worker/entity-graph/commit-rebuild.bench.ts`
 */
// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { defaultVizConfig } from "../../config";
import { benchTypeSchemas, buildIngestEntities } from "../bench-fixtures";
import { CommitCoalescer } from "../core/commit-coalescer";
import { EntityGraphWorker } from "./worker";

import type { GraphShape } from "../bench-fixtures";
import type { IngestEntity } from "../protocol";

/** Fresh workers are built per iteration below, and each is relatively
 * expensive, so bound the fresh-worker benches to a fixed iteration count. */
const FRESH_WORKER_OPTS = {
  time: 0,
  iterations: 6,
  warmupTime: 0,
  warmupIterations: 1,
} as const;

const IGNORE = (): void => {
  // Suppress frame/layout callbacks so vitest measures commit cost only.
};

function newWorker(typeCount: number): EntityGraphWorker {
  const worker = new EntityGraphWorker(defaultVizConfig);
  worker.onLayoutMessage = IGNORE;
  worker.onStructureFrame = IGNORE;
  worker.onPositionsFrame = IGNORE;
  worker.registerTypes(benchTypeSchemas(typeCount), []);
  return worker;
}

/** Ingest the whole graph, commit twice (stabilise mode + tree), record a
 * viewport (so the hierarchical tier has a cut to recompute), and return the
 * worker sitting in a committed steady state. */
function primedWorker(shape: GraphShape): EntityGraphWorker {
  const worker = newWorker(shape.typeCount);
  const deltas = worker.ingestBatch(buildIngestEntities(shape));
  worker.commitStructure({ deltas });
  worker.commitStructure();
  worker.handleViewport({
    zoom: 1,
    centerX: 0,
    centerY: 0,
    width: 1600,
    height: 900,
  });
  return worker;
}

interface Case {
  readonly label: string;
  readonly shape: GraphShape;
}

const NOOP_CASES: readonly Case[] = [
  {
    label: "flat-force (150 nodes)",
    shape: {
      nodeCount: 150,
      linkCount: 300,
      typeCount: 8,
      hubCount: 8,
      rootFraction: 1,
      seed: 41,
    },
  },
  {
    label: "community-force (1500 nodes)",
    shape: {
      nodeCount: 1_500,
      linkCount: 4_000,
      typeCount: 16,
      hubCount: 40,
      rootFraction: 1,
      seed: 42,
    },
  },
  {
    label: "hierarchical-lod (8000 nodes)",
    shape: {
      nodeCount: 8_000,
      linkCount: 20_000,
      typeCount: 24,
      hubCount: 80,
      rootFraction: 1,
      seed: 43,
    },
  },
];

for (const { label, shape } of NOOP_CASES) {
  const worker = primedWorker(shape);
  describe(`no-op re-commit: ${label}`, () => {
    bench("commitStructure() with no changes", () => {
      worker.commitStructure();
    });
  });
}

// Same final graph, delivered bulk vs streamed. Lands in community-force.
const STREAM_SHAPE: GraphShape = {
  nodeCount: 2_000,
  linkCount: 5_000,
  typeCount: 16,
  hubCount: 40,
  rootFraction: 1,
  seed: 51,
};
const STREAM_ENTITIES: readonly IngestEntity[] =
  buildIngestEntities(STREAM_SHAPE);
const STREAM_BATCH = 100;

describe(`ingest ${STREAM_SHAPE.nodeCount} nodes / ${STREAM_SHAPE.linkCount} links`, () => {
  bench(
    "bulk: 1 batch + 1 commit",
    () => {
      const worker = newWorker(STREAM_SHAPE.typeCount);
      const deltas = worker.ingestBatch(STREAM_ENTITIES);
      worker.commitStructure({ deltas });
    },
    FRESH_WORKER_OPTS,
  );

  // Uncoalesced streaming baseline: one commit per batch, representing the
  // per-commit O(N) tax coalescing is meant to reduce.
  bench(
    `streaming, uncoalesced: ${STREAM_BATCH}-entity batches + commit each`,
    () => {
      const worker = newWorker(STREAM_SHAPE.typeCount);
      for (
        let start = 0;
        start < STREAM_ENTITIES.length;
        start += STREAM_BATCH
      ) {
        const chunk = STREAM_ENTITIES.slice(start, start + STREAM_BATCH);
        const deltas = worker.ingestBatch(chunk);
        worker.commitStructure({ deltas });
        worker.restyleIfRootsFlipped();
      }
    },
    FRESH_WORKER_OPTS,
  );

  // Coalesced streaming path: per-batch ingest with commits routed through
  // CommitCoalescer. This synchronous bench never delivers the MessageChannel
  // drain mid-run, so the batch-count cap paces commits (worst-case saturated
  // queue). Real inter-batch gaps commit less often. The trailing flush()
  // stands in for the drain hook.
  bench(
    `streaming, coalesced: ${STREAM_BATCH}-entity batches through CommitCoalescer`,
    () => {
      const worker = newWorker(STREAM_SHAPE.typeCount);
      const coalescer = new CommitCoalescer({
        commit: ({ deltas, rebuildTree }) => {
          worker.commitStructure({ deltas, rebuildTree });
          worker.restyleIfRootsFlipped();
        },
      });
      for (
        let start = 0;
        start < STREAM_ENTITIES.length;
        start += STREAM_BATCH
      ) {
        const chunk = STREAM_ENTITIES.slice(start, start + STREAM_BATCH);
        coalescer.enqueueDeltas(worker.ingestBatch(chunk));
      }
      coalescer.flush();
    },
    FRESH_WORKER_OPTS,
  );
});
