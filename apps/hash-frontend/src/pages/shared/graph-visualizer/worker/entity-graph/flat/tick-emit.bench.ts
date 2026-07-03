/* eslint-disable no-console -- committed metrics harness whose whole purpose is to PRINT
   the flat-tier tick→emit loop's wall-time profile. */
/**
 * Production-loop profile for the flat tier: how long the captured 20k graph
 * takes to settle when every solver tick pays the SAME per-tick overhead the
 * worker's real tick loop pays, and where that overhead goes.
 *
 * The scale bench ({@link "../../layout/majorization-scale.bench"}) measures
 * the solver alone: `tick(1)` back to back. In production every tick that
 * reports a change ALSO runs the positions-frame emission
 * ({@link "../frames/positions-frame"} → {@link "./edges"}): rebuild all
 * edge beziers + arrows from current positions, snapshot the segment sink,
 * and serialise the frame over `postMessage`. This harness replays that loop
 * faithfully with the real engine, the real {@link FlatEdgePipeline}, the
 * real {@link BezierSegmentSink}, and `structuredClone` with the production
 * transfer list standing in for `postMessage` serialisation, and prints the
 * wall-time split (solver / bezier build / snapshot / serialise) plus the
 * emit count, so a change to the emit cadence or the emit cost shows up as a
 * direct before/after on the number that matters: wall-to-settled at 60 fps
 * frame budgets.
 *
 * Run (from apps/hash-frontend):
 *   node_modules/.bin/vitest bench --run \
 *     src/pages/shared/graph-visualizer/worker/entity-graph/flat/tick-emit.bench.ts \
 *     --disable-console-intercept
 */
import { readFileSync } from "node:fs";
import path from "node:path";

// eslint-disable-next-line import/no-extraneous-dependencies
import { bench, describe } from "vitest";

import { EntityIndex } from "../../../ids";
import { forceGraphFromCapturedFixture } from "../../bench-fixtures";
import { FlatGraphBuffer } from "../../buffers/position-buffer";
import { ReadonlySortedSet } from "../../collections/readonly-sorted-set";
import {
  BezierSegmentSink,
  EndpointArrowSink,
} from "../../geometry/edge-geometry";
import { createMajorizationLayout } from "../../layout/majorization-layout";
import { LinkStore } from "../store/link";
import { TypeRegistry } from "../../store/type-registry";
import { TypeSetStore } from "../store/type-set";
import { FlatEdgePipeline } from "./edges";

import type { PositionsFrame } from "../../../frames";
import type { TypeId } from "../../../ids";
import type { CapturedLayoutFixture } from "../../protocol";

const FIXTURE_PATH = path.join(
  __dirname,
  "../../layout/fixtures/graph-fixture-20000n-22379e.json",
);

/** The worker tick budget the production loop passes to `layout.tick`. */
const TICK_BUDGET_MS = 1;
/** Safety cap so a regression cannot hang the bench (production has none). */
const WALL_BUDGET_MS = Number(process.env.FLAT_TICK_EMIT_BUDGET ?? 300) * 1000;

interface LoopProfile {
  readonly wallMs: number;
  readonly ticks: number;
  readonly emits: number;
  readonly solverMs: number;
  readonly bezierMs: number;
  readonly snapshotMs: number;
  readonly serialiseMs: number;
  readonly loopP50: number;
  readonly loopP95: number;
  readonly loopMax: number;
  readonly loopsOver16: number;
  readonly settled: boolean;
  readonly segments: number;
  readonly arrows: number;
}

function percentileOf(sorted: readonly number[], quantile: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * quantile),
  );
  return sorted[index]!;
}

/**
 * Replays the production per-tick sequence: `layout.tick(1)`, and on a
 * reported change the full positions-frame emission (bezier rebuild →
 * snapshot → serialise with the entry.ts transfer list).
 */
function profileProductionLoop(): LoopProfile {
  const fixture = JSON.parse(
    readFileSync(FIXTURE_PATH, "utf8"),
  ) as CapturedLayoutFixture;
  // Cold replay (scrambled seed): the same "artificial stress test" shape the
  // dev harness runs on the live graph.
  const { nodes, edges } = forceGraphFromCapturedFixture(fixture, {
    scrambleSeed: 1,
  });

  // Real LinkStore so FlatEdgePipeline.rebuild walks the same adjacency it
  // walks in production. Link entities get indices past the node range; one
  // typeless interned group resolves every link to the default edge colour.
  const links = new LinkStore();
  const typeSets = new TypeSetStore();
  const linkGroup = typeSets.getOrCreate(
    new ReadonlySortedSet<TypeId>([], (lhs, rhs) => lhs - rhs),
    1,
  );
  for (const [edgeIndex, edge] of edges.entries()) {
    const source =
      typeof edge.source === "string" ? edge.source : edge.source.id;
    const target =
      typeof edge.target === "string" ? edge.target : edge.target.id;
    links.insert(
      EntityIndex(Number(source)),
      EntityIndex(Number(target)),
      linkGroup.id,
      EntityIndex(nodes.length + edgeIndex),
    );
  }

  const buffer = new FlatGraphBuffer(nodes.length + 64);
  buffer.setCount(nodes.length);
  const layout = createMajorizationLayout(nodes, edges, buffer);

  const pipeline = new FlatEdgePipeline({
    links,
    typeSets,
    types: new TypeRegistry(),
    layout: () => layout,
    highlightedEntities: () => new Set(),
  });
  pipeline.rebuild(layout);

  const sink = new BezierSegmentSink();
  const arrowSink = new EndpointArrowSink();

  let ticks = 0;
  let emits = 0;
  let solverMs = 0;
  let bezierMs = 0;
  let snapshotMs = 0;
  let serialiseMs = 0;
  let segments = 0;
  let arrows = 0;
  const loopSamples: number[] = [];

  const start = performance.now();
  let version = 0;
  while (layout.status !== "settled") {
    const loopStart = performance.now();
    const changed = layout.tick(TICK_BUDGET_MS);
    const afterTick = performance.now();
    solverMs += afterTick - loopStart;
    ticks += 1;

    if (changed) {
      emits += 1;
      sink.reset();
      arrowSink.reset();
      pipeline.buildEdgeBeziers(sink, arrowSink);
      const afterBezier = performance.now();
      bezierMs += afterBezier - afterTick;

      const beziers = sink.snapshot();
      const flatArrows = arrowSink.snapshot();
      const afterSnapshot = performance.now();
      snapshotMs += afterSnapshot - afterBezier;

      version += 1;
      const frame: PositionsFrame = {
        version,
        settled: layout.isSettled,
        clusterPositions: new Float32Array(0),
        beziers,
        edgeLabels: [],
        edgeArrows: [],
        flatArrows,
        entityFanOut: [],
      };
      // postMessage stand-in: the HTML structured-serialise walk over the
      // frame, with the same buffers transferred that entry.ts transfers.
      structuredClone(frame, {
        transfer: [
          frame.clusterPositions.buffer,
          beziers.positions.buffer,
          beziers.colors.buffer,
          beziers.widths.buffer,
          beziers.clips.buffer,
          beziers.ids.buffer,
          flatArrows.positions.buffer,
          flatArrows.angles.buffer,
          flatArrows.sizes.buffer,
          flatArrows.chords.buffer,
          flatArrows.colors.buffer,
        ],
      });
      serialiseMs += performance.now() - afterSnapshot;
      segments = beziers.segmentCount;
      arrows = flatArrows.count;
    }

    loopSamples.push(performance.now() - loopStart);
    if (performance.now() - start > WALL_BUDGET_MS) {
      break;
    }
  }
  const wallMs = performance.now() - start;

  loopSamples.sort((first, second) => first - second);
  return {
    wallMs,
    ticks,
    emits,
    solverMs,
    bezierMs,
    snapshotMs,
    serialiseMs,
    loopP50: percentileOf(loopSamples, 0.5),
    loopP95: percentileOf(loopSamples, 0.95),
    loopMax: loopSamples[loopSamples.length - 1] ?? 0,
    loopsOver16: loopSamples.filter((sample) => sample > 16).length,
    settled: layout.isSettled,
    segments,
    arrows,
  };
}

function printProfile(profile: LoopProfile): void {
  console.log(
    `\n=== flat tick→emit loop: captured 20k fixture (cold replay) ===`,
  );
  console.log(
    `wallMs=${profile.wallMs.toFixed(0)} settled=${profile.settled} ` +
      `ticks=${profile.ticks} emits=${profile.emits} ` +
      `segments=${profile.segments} arrows=${profile.arrows}`,
  );
  console.log(
    `phase ms: solver=${profile.solverMs.toFixed(0)} ` +
      `bezier=${profile.bezierMs.toFixed(0)} ` +
      `snapshot=${profile.snapshotMs.toFixed(0)} ` +
      `serialise=${profile.serialiseMs.toFixed(0)} ` +
      `(emit total=${(
        profile.bezierMs +
        profile.snapshotMs +
        profile.serialiseMs
      ).toFixed(0)})`,
  );
  console.log(
    `loop ms: p50=${profile.loopP50.toFixed(2)} ` +
      `p95=${profile.loopP95.toFixed(2)} max=${profile.loopMax.toFixed(1)} ` +
      `>16ms: ${profile.loopsOver16}`,
  );
}

printProfile(profileProductionLoop());

describe("flat tick→emit loop (smoke)", () => {
  bench("noop (profile runs at module scope)", () => {
    /* the profile above is the artefact; this bench satisfies the runner */
  });
});
