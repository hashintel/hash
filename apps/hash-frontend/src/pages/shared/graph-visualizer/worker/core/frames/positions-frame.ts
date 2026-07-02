/**
 * PositionsFrame emission: cluster positions, highway/feeder Bezier
 * geometry, edge labels/arrows, and the per-leaf entity fan-out, all
 * computed from the current node positions against the committed topology.
 * Runs every tick that moved something, plus once per structure commit.
 */
import { entityIndexFromNodeId } from "../../../ids";
import { computeAllPorts } from "../../geometry/bubble-ports";
import { makePairKey } from "../../geometry/edge-aggregation";
import {
  BezierSegmentSink,
  buildBezierSegments,
  containerBoundaryWaypoint,
  highwayEndpoints,
  portsFor,
} from "../../geometry/edge-geometry";

import type { VizConfig } from "../../../config";
import type {
  PositionsFrame,
  RenderEdgeArrow,
  RenderEdgeLabel,
  RenderEntityFanOut,
} from "../../../frames";
import type { Position } from "../../../geometry";
import type { ClusterId, TypeSetId } from "../../../ids";
import type { Port, PortCache } from "../../geometry/bubble-ports";
import type { CutIndex, EdgeAggregator } from "../../geometry/edge-aggregation";
import type { ClusterTree } from "../../hierarchy/cluster-tree";
import type { LinkStore } from "../../store/link";
import type { CommittedView } from "../committed-view";
import type { PortConstraintController } from "../hierarchical/port-constraints";
import type { LayoutRegistry } from "../layout-registry";
import type { LeafLocalCache } from "./leaf-local-cache";

type PortPairs = ReadonlyMap<
  string,
  { readonly source: Port; readonly target: Port }
>;

/** Supplies straight clipped edge segments when hierarchical Bezier routing is inactive. */
export interface FlatEdgeSource {
  readonly hasRenderEdges: boolean;
  buildEdgeBeziers(sink: BezierSegmentSink, arrowsOut: RenderEdgeArrow[]): void;
}

export interface PositionsFrameDependencies {
  readonly config: VizConfig;
  readonly view: CommittedView;
  readonly layouts: LayoutRegistry;
  readonly leafLocalCache: LeafLocalCache;
  readonly clusterTree: ClusterTree;
  readonly links: LinkStore;
  readonly edgeAggregator: EdgeAggregator;
  readonly portCache: PortCache;
  readonly portConstraints: PortConstraintController;
  readonly flatEdges: FlatEdgeSource;
  readonly syncWorldPositions: () => void;
  readonly onFrame: (frame: PositionsFrame) => void;
}

export class PositionsFrameEmitter {
  readonly #dependencies: PositionsFrameDependencies;

  #version = 0;
  /** Reused flat-array scratch for Bezier segments; snapshot()ed per frame. */
  readonly #bezierSink = new BezierSegmentSink();

  constructor(dependencies: PositionsFrameDependencies) {
    this.#dependencies = dependencies;
  }

  /**
   * Publishes one positions tick: syncs world circles, recomputes ports and
   * edge geometry, and fans out per-leaf feeder endpoints.
   */
  emit(): void {
    const { view, layouts, clusterTree, config, flatEdges } =
      this.#dependencies;

    // Authoritative: recompose the opened subtree's world circles before any
    // positional read, so a moved ancestor reaches its whole subtree (incl.
    // settled depth >= 2 layouts), on commit ticks too, not only while moving.
    this.#dependencies.syncWorldPositions();
    const ports = this.#computePorts();

    // Labels are emitted by the geometry builder at true curve midpoints, so
    // they sit on the drawn highways (one per merged highway, not per base pair).
    const edgeLabels: RenderEdgeLabel[] = [];
    const edgeArrows: RenderEdgeArrow[] = [];

    this.#bezierSink.reset();
    if (view.edgeFrame && view.cutIndex) {
      // Every visible bubble (including opened containers) is a potential
      // obstacle; routeAround exempts the ones that enclose an edge's endpoint.
      const obstacles = view.rendered.map((entry) => ({
        id: entry.node.id,
        circle: entry.node.circle,
      }));

      buildBezierSegments(
        view.edgeFrame,
        ports,
        { clusterTree, cutIndex: view.cutIndex, obstacles },
        config,
        this.#bezierSink,
        edgeLabels,
        edgeArrows,
      );
    } else if (flatEdges.hasRenderEdges) {
      // Flat tier emits straight clipped segments because no cluster
      // containers exist to route around.
      flatEdges.buildEdgeBeziers(this.#bezierSink, edgeArrows);
    }

    const beziers = this.#bezierSink.snapshot();

    const clusterPositions = new Float32Array(view.rendered.length * 2);
    for (let idx = 0; idx < view.rendered.length; idx++) {
      const circle = view.rendered[idx]!.node.circle;
      clusterPositions[idx * 2] = circle.x;
      clusterPositions[idx * 2 + 1] = circle.y;
    }

    // Fan-out feeder endpoints + force targets for the current positions
    // (positional: refreshed every tick, never via the structure frame).
    const entityFanOut =
      view.cutIndex && view.edgeFrame
        ? this.#buildEntityFanOut(view.cutIndex, ports)
        : [];

    this.#version++;
    this.#dependencies.onFrame({
      version: this.#version,
      // settled gates main-thread animation: false while any force sim is
      // still running.
      settled: !layouts.anyLayoutRunning(),
      clusterPositions,
      beziers,
      edgeLabels,
      edgeArrows,
      entityFanOut,
    });
  }

  /**
   * Recompute ports at the current positions. Ports live at the highway level:
   * each base pair is collapsed to its outermost rendered containers, so a
   * cluster's port toward a neighbor's subtree is stable whether that
   * subtree's container is open or closed (opening an unrelated container
   * does not reshuffle a cluster's ports).
   */
  #computePorts(): PortPairs {
    const { view, clusterTree, edgeAggregator, portCache, config } =
      this.#dependencies;
    if (!view.edgeFrame || !view.cutIndex) {
      return new Map();
    }
    const containerIds = view.cutIndex.containerIds;
    const highwayPairs = new Map<
      string,
      {
        readonly sourceId: ClusterId;
        readonly targetId: ClusterId;
        totalCount: number;
        readonly byType: Set<TypeSetId>;
      }
    >();

    for (const pair of edgeAggregator.pairs.values()) {
      const { highwaySourceId: hwSourceId, highwayTargetId: hwTargetId } =
        highwayEndpoints(
          pair.sourceId,
          pair.targetId,
          clusterTree,
          containerIds,
        );
      if (hwSourceId === hwTargetId) {
        continue;
      }
      const { key, sourceId, targetId } = makePairKey(hwSourceId, hwTargetId);
      let highway = highwayPairs.get(key);
      if (!highway) {
        highway = { sourceId, targetId, totalCount: 0, byType: new Set() };
        highwayPairs.set(key, highway);
      }
      highway.totalCount += pair.totalCount;
      for (const typeSetId of pair.byType.keys()) {
        highway.byType.add(typeSetId);
      }
    }

    return computeAllPorts(highwayPairs, clusterTree, config, portCache);
  }

  /**
   * Fan-out feeder endpoints for the current positions (one entry per open
   * leaf), plus a refill of each leaf's port-attraction targets. The exit
   * per external owner is the leaf's boundary point toward the highway port,
   * chaining into the feeder.
   */
  #buildEntityFanOut(
    cutIndex: CutIndex,
    ports: PortPairs,
  ): RenderEntityFanOut[] {
    const { layouts, clusterTree, leafLocalCache, links, config } =
      this.#dependencies;
    const result: RenderEntityFanOut[] = [];
    // While the macro is still moving, keep dot layouts warm so dots
    // track the continuous port drift instead of lagging it.
    const clustersRunning = layouts.anyClusterLayoutRunning();

    for (const leafId of cutIndex.entityModeIds) {
      const cluster = clusterTree.get(leafId);
      const layout = layouts.get(leafId);
      if (!cluster || !layout) {
        continue;
      }

      const localOf = leafLocalCache.of(layout);

      const exitForOwner = new Map<ClusterId, Position | null>();

      const ownerExit = (otherOwner: ClusterId): Position | null => {
        const cached = exitForOwner.get(otherOwner);
        if (cached !== undefined) {
          return cached;
        }

        const { highwaySourceId, highwayTargetId } = highwayEndpoints(
          leafId,
          otherOwner,
          clusterTree,
          cutIndex.containerIds,
        );

        const highwayPorts =
          highwaySourceId === highwayTargetId
            ? undefined
            : portsFor(ports, highwaySourceId, highwayTargetId);

        let exit: Position | null = null;
        if (highwayPorts) {
          // Aim at the feeder's first waypoint (the nearest enclosing
          // container boundary toward the outermost port), not the port
          // directly. At depth >= 2 these differ; sharing the waypoint
          // function keeps fan-out and feeder aligned.
          let target: Position = highwayPorts.a;
          let ancestor = cluster.parent;

          while (ancestor) {
            if (cutIndex.containerIds.has(ancestor.id)) {
              if (ancestor.id !== highwaySourceId) {
                target = containerBoundaryWaypoint(
                  ancestor.circle,
                  highwayPorts.a.x,
                  highwayPorts.a.y,
                  config.portPaddingWorld,
                );
              }

              break;
            }

            ancestor = ancestor.parent;
          }

          const angle = Math.atan2(
            target.y - cluster.circle.y,
            target.x - cluster.circle.x,
          );

          exit = {
            x: cluster.circle.radius * Math.cos(angle),
            y: cluster.circle.radius * Math.sin(angle),
          };
        }

        exitForOwner.set(otherOwner, exit);
        return exit;
      };

      const portTargets =
        this.#dependencies.portConstraints.portTargetsOf(leafId);

      // A dot gaining or losing an external connection (e.g. on reopen, or a
      // highway re-routing) must re-energise the sim even when the macro is
      // settled: a structural change, not continuous drift.
      let connectivityChanged = false;
      const fanOut: number[] = [];

      for (const node of layout.nodes) {
        const entityIdx = entityIndexFromNodeId(node.id);
        // layout.nodes and localOf are built from the same nodeIds list, so
        // every layout node id maps to a local slot.
        const localIdx = localOf.get(entityIdx)!;
        const seenTargets = new Set<ClusterId>();

        let sumX = 0;
        let sumY = 0;
        let exitCount = 0;

        for (const link of links.linksFor(entityIdx)) {
          const otherOwner = cutIndex.ownerOf(link.otherId);
          if (
            !otherOwner ||
            otherOwner === leafId ||
            seenTargets.has(otherOwner)
          ) {
            continue;
          }

          seenTargets.add(otherOwner);

          const exit = ownerExit(otherOwner);
          if (exit) {
            fanOut.push(localIdx, exit.x, exit.y);
            sumX += exit.x;
            sumY += exit.y;
            exitCount += 1;
          }
        }

        // Port-attraction target: centroid of this entity's exits
        // (NaN = no external connection).
        if (portTargets) {
          const hasTarget = exitCount > 0;
          const nextX = hasTarget ? sumX / exitCount : Number.NaN;
          const nextY = hasTarget ? sumY / exitCount : Number.NaN;
          const hadTarget = !Number.isNaN(portTargets[localIdx * 2]!);

          if (hadTarget !== hasTarget) {
            connectivityChanged = true;
          }

          portTargets[localIdx * 2] = nextX;
          portTargets[localIdx * 2 + 1] = nextY;
        }
      }

      // Re-energise the entity sim so dots reach their (possibly moved) ports.
      if (clustersRunning || connectivityChanged) {
        layout.resume();
      }

      result.push({ layoutId: leafId, fanOut: Float32Array.from(fanOut) });
    }

    return result;
  }
}
