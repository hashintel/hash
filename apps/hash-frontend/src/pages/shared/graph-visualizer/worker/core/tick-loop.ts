/**
 * The per-frame simulation step driven by {@link TickScheduler}: advance every
 * running layout once, propagate cluster movement into world positions and
 * port anchors, and emit PositionsFrames. Purely positional: the topology
 * pipeline (cut, CutIndex, aggregation) never runs here.
 */
import { sharedBufferAvailable } from "../layout/force-simulation";
import { FLAT_LAYOUT_ID } from "./flat/flat-tier";

import type { ClusterTree } from "../hierarchy/cluster-tree";
import type { LayoutSimulation } from "../layout/force-simulation";
import type { LayoutSideChannelMessage } from "../protocol";
import type { PositionsFrameEmitter } from "./frames/positions-frame";
import type { PortConstraintController } from "./hierarchical/port-constraints";
import type { SettlePolisher } from "./hierarchical/settle-polish";
import type { LayoutRegistry } from "./layout-registry";

const SLOW_TICK_WARNING_MS = 10;

export interface TickLoopDependencies {
  readonly debug: boolean;
  readonly layouts: LayoutRegistry;
  readonly clusterTree: ClusterTree;
  readonly polisher: SettlePolisher;
  readonly portConstraints: PortConstraintController;
  readonly positionsEmitter: PositionsFrameEmitter;
  /** Recompose world positions over the opened subtree after clusters moved. */
  readonly syncWorldPositions: () => void;
  readonly postLayoutMessage: (msg: LayoutSideChannelMessage) => void;
  /** Stop the scheduler once every layout has settled. */
  readonly stopScheduler: () => void;
}

export class TickLoop {
  readonly #dependencies: TickLoopDependencies;

  constructor(dependencies: TickLoopDependencies) {
    this.#dependencies = dependencies;
  }

  /**
   * One simulation step across all active layouts.
   *
   * Entity layouts stream positions via SharedArrayBuffer. Cluster layouts
   * write back to child circles; when any cluster moved, a PositionsFrame is
   * emitted.
   */
  tick(): void {
    const { layouts, clusterTree, polisher } = this.#dependencies;

    const tickStart = performance.now();
    const clustersRunningBefore = layouts.anyClusterLayoutRunning();
    const layoutsRunningBefore = layouts.anyLayoutRunning();

    let clusterMoved = false;
    let flatMoved = false;

    for (const [clusterId, layout] of layouts.entries()) {
      if (layout.status === "settled" || layout.status === "paused") {
        continue;
      }

      const kind = layouts.kindOf(clusterId);

      const layoutTickStart = performance.now();
      const changed = layout.tick(1);
      const layoutTickMs = performance.now() - layoutTickStart;

      if (this.#dependencies.debug && kind === "entities") {
        this.#logOverlapDiagnostics(clusterId, layout, changed, layoutTickMs);
      }

      if (kind === "entities") {
        if (changed && clusterId === FLAT_LAYOUT_ID) {
          // Flat edges are worker-built beziers; emit a frame so they
          // track the moved dots.
          flatMoved = true;
        } else if (changed && !sharedBufferAvailable) {
          // Non-shared-buffer fallback: post position snapshots.
          const positions = new Float32Array(layout.nodes.length * 2);
          for (let idx = 0; idx < layout.nodes.length; idx++) {
            const node = layout.nodes[idx]!;
            positions[idx * 2] = node.x ?? 0;
            positions[idx * 2 + 1] = node.y ?? 0;
          }
          this.#dependencies.postLayoutMessage({
            type: "LAYOUT_POSITIONS",
            clusterId,
            positions,
          });
        }
        continue;
      }

      // Cluster layout moved, so the top-down propagation pass below writes the
      // world circles (it must run for settled intermediates too, so it can't
      // live here in the per-ticked-layout loop).
      const cluster = clusterTree.get(clusterId);
      if (
        changed &&
        cluster &&
        cluster.children.length === layout.nodes.length
      ) {
        clusterMoved = true;
      }

      // On the tick when a layout settles, polish positions once (root ->
      // optimiser, sub-cluster -> untangle). Also runs from
      // ensureChildrenLayout for layouts that settle during their warm-up
      // (which this loop would skip).
      if (cluster && layout.isSettled && !polisher.isPolished(clusterId)) {
        polisher.polishSettledLayout(cluster, layout);
        clusterMoved = true;
      }
    }

    // Emit when clusters moved, when the last cluster layout settles (final
    // settled flag), or when the flat graph moved / any layout just settled.
    const clustersJustSettled =
      clustersRunningBefore && !layouts.anyClusterLayoutRunning();

    const layoutsJustSettled =
      layoutsRunningBefore && !layouts.anyLayoutRunning();

    if (clusterMoved || clustersJustSettled) {
      // Recompose world positions top-down so anchor re-aiming reads correct,
      // fully-propagated circles through settled nested layouts.
      this.#dependencies.syncWorldPositions();

      if (clusterMoved) {
        // Re-aim opened sub-clusters' port anchors at their moved neighbours.
        this.#dependencies.portConstraints.updateAnchorTracking();
      }

      this.#dependencies.positionsEmitter.emit();
    } else if (flatMoved || layoutsJustSettled) {
      this.#dependencies.positionsEmitter.emit();
    }

    if (!layouts.anyLayoutRunning()) {
      this.#dependencies.stopScheduler();
    }

    const elapsed = performance.now() - tickStart;
    if (this.#dependencies.debug && elapsed > SLOW_TICK_WARNING_MS) {
      // eslint-disable-next-line no-console
      console.warn(
        `[graph-worker][slow tick] ${elapsed.toFixed(1)}ms (${layouts.size} layouts)`,
      );
    }
  }

  /**
   * Per-tick instrumentation for the majorization engine's overlap projection:
   * confirms on the user's actual graph that no single tick freezes and that
   * the overlap count marches to zero. Debug-gated; the fields are duck-typed
   * (read structurally off the layout) so the tick loop needs no engine import.
   */
  #logOverlapDiagnostics(
    clusterId: string,
    layout: LayoutSimulation,
    changed: boolean,
    layoutTickMs: number,
  ): void {
    // Debug-only duck typing: majorization layouts expose these fields;
    // other engines omit them and skip logging.
    const diag = layout as Partial<{
      /** Strict disk overlaps at the last iterate / settle verification. */
      overlapsRemaining: number;
      /** Majorization iterations completed. */
      overlapProjectionCalls: number;
      /** Worst single tick (ms), the per-tick budget guard. */
      maxTickMs: number;
      /** Laplacian (re)builds (cold build + every warm absorb/relayout). */
      laplacianRebuilds: number;
      edgeCount: number;
      /** Iteration cap hit (solve stopped before convergence). */
      capped: boolean;
      /** Settle pass cap hit (violations may remain). */
      settleCapped: boolean;
      /** Community-region floor violations at last measurement. */
      regionViolations: number;
    }>;

    if (
      !changed ||
      typeof diag.overlapProjectionCalls !== "number" ||
      diag.overlapProjectionCalls <= 0
    ) {
      return;
    }

    const cappedFlags = [
      ...(diag.capped ? ["iterations"] : []),
      ...(diag.settleCapped ? ["settle"] : []),
    ];

    const parts = [
      `[graph-worker][majorization] cluster=${clusterId}`,
      `n=${layout.nodes.length}`,
      `edges=${diag.edgeCount ?? "?"}`,
      `tickMs=${layoutTickMs.toFixed(2)}`,
      `iterations=${diag.overlapProjectionCalls}`,
      `overlaps=${diag.overlapsRemaining ?? "?"}`,
      ...(diag.regionViolations !== undefined
        ? [`regionViolations=${diag.regionViolations}`]
        : []),
      `rebuilds=${diag.laplacianRebuilds ?? 0}`,
      `maxTickMs=${(diag.maxTickMs ?? 0).toFixed(2)}`,
      ...(cappedFlags.length > 0 ? [`capped=${cappedFlags.join("+")}`] : []),
    ];

    // eslint-disable-next-line no-console
    console.debug(parts.join(" "));
  }
}
