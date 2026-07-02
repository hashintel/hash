/**
 * The flat tier's edge pipeline: per-link render edges (local node indices +
 * link-type colour, rebuilt on commit) and the per-tick pass that turns them
 * into straight clipped beziers + arrowheads from current node positions.
 *
 * Implements the `FlatEdgeSource` contract the positions emitter reads.
 */
import { dimColor } from "../../../dim-color";
import { entityIndexFromNodeId } from "../../../ids";
import { edgeColorForTypeGroup } from "./entity-colors";

import type { Color, RenderEdgeArrow } from "../../../frames";
import type { EntityIndex, LinkId } from "../../../ids";
import type { BezierSegmentSink } from "../../geometry/edge-geometry";
import type { LayoutSimulation } from "../../layout/force-simulation";
import type { LinkStore } from "../../store/link";
import type { TypeRegistry } from "../../store/type-registry";
import type { TypeSetStore } from "../../store/type-set";
import type { ColorCache } from "./entity-colors";

/** Flat-tier edge stroke width in world units (the layer scales it with zoom). */
export const FLAT_EDGE_WIDTH_WORLD = 1.2;

/**
 * Degree-scaled link fading: a link incident to a high-degree hub draws fainter, so a
 * 150-leaf starburst reads as a soft halo instead of an opaque disk of strokes (every
 * spoke crowds the same few pixels around the hub. Full-alpha spokes sum to a blob
 * that hides both the hub and any through-traffic). The scale ramps down with the
 * LOG of the larger endpoint degree: links into ordinary nodes (degree below the
 * start) keep full alpha, and the ramp saturates at a floor so hub links stay
 * visible, just de-emphasised.
 */
const HUB_LINK_FADE_START_DEGREE = 8;
const HUB_LINK_FADE_END_DEGREE = 128;
const HUB_LINK_FADE_MIN_SCALE = 0.3;

/** Alpha multiplier in [HUB_LINK_FADE_MIN_SCALE, 1] for a link whose larger endpoint has `degree`. */
function hubLinkAlphaScale(degree: number): number {
  if (degree <= HUB_LINK_FADE_START_DEGREE) {
    return 1;
  }

  const ramp =
    Math.log(degree / HUB_LINK_FADE_START_DEGREE) /
    Math.log(HUB_LINK_FADE_END_DEGREE / HUB_LINK_FADE_START_DEGREE);

  return 1 - Math.min(1, ramp) * (1 - HUB_LINK_FADE_MIN_SCALE);
}

/**
 * A flat-tier render edge: local node indices into the flat layout plus the
 * link's own type colour. Rebuilt each commit (topology + colour); the per-tick
 * geometry just reads the two nodes' current positions for these.
 */
interface FlatRenderEdge {
  readonly sourceIdx: number;
  readonly targetIdx: number;
  readonly color: Color;
  /** The link's own EntityIdx, so a picked edge resolves to its link entity. */
  readonly linkEntityIdx: EntityIndex;
}

export interface FlatEdgePipelineDependencies {
  readonly links: LinkStore;
  readonly typeSets: TypeSetStore;
  readonly types: TypeRegistry;
  /** The live flat layout, or undefined outside the flat regime. */
  readonly layout: () => LayoutSimulation | undefined;
  readonly highlightedEntities: () => ReadonlySet<EntityIndex>;
}

export class FlatEdgePipeline {
  readonly #dependencies: FlatEdgePipelineDependencies;

  /** One entry per link between placed nodes; rebuilt each commit. */
  #renderEdges: FlatRenderEdge[] = [];

  constructor(dependencies: FlatEdgePipelineDependencies) {
    this.#dependencies = dependencies;
  }

  get hasRenderEdges(): boolean {
    return this.#renderEdges.length > 0;
  }

  clear(): void {
    this.#renderEdges = [];
  }

  /**
   * Rebuild the render edges: local node indices + link-type colour for each
   * link whose endpoints are both in the layout's node set.
   */
  rebuild(layout: LayoutSimulation): void {
    const { links, typeSets, types } = this.#dependencies;
    const localOf = new Map<EntityIndex, number>();

    for (let idx = 0; idx < layout.nodeIds.length; idx++) {
      localOf.set(entityIndexFromNodeId(layout.nodeIds[idx]!), idx);
    }

    const colorCache: ColorCache = new Map();
    const seenLinks = new Set<LinkId>();
    const edges: FlatRenderEdge[] = [];

    for (const [entityIdx, sourceIdx] of localOf) {
      for (const link of links.linksFor(entityIdx)) {
        if (seenLinks.has(link.linkId)) {
          continue;
        }

        const targetIdx = localOf.get(link.otherId);
        if (targetIdx === undefined) {
          continue;
        }

        seenLinks.add(link.linkId);

        // Hub-incident links draw fainter (degree-scaled alpha) so a hub's spoke
        // fan reads as a halo rather than an opaque starburst. Applied here (once
        // per commit) rather than per tick: degree only changes with topology.
        const typeColor = edgeColorForTypeGroup(
          link.typeSetId,
          colorCache,
          typeSets,
          types,
        );

        const fade = hubLinkAlphaScale(
          Math.max(links.degreeOf(entityIdx), links.degreeOf(link.otherId)),
        );

        const color: Color =
          fade < 1
            ? [
                typeColor[0],
                typeColor[1],
                typeColor[2],
                Math.round(typeColor[3] * fade),
              ]
            : typeColor;

        edges.push({
          sourceIdx: link.direction === "out" ? sourceIdx : targetIdx,
          targetIdx: link.direction === "out" ? targetIdx : sourceIdx,
          color,
          linkEntityIdx: links.getEntityIndex(link.linkId),
        });
      }
    }

    this.#renderEdges = edges;
  }

  /** Emit one straight cubic per flat render edge from current node positions. */
  buildEdgeBeziers(
    sink: BezierSegmentSink,
    arrowsOut: RenderEdgeArrow[],
  ): void {
    const layout = this.#dependencies.layout();
    if (!layout) {
      return;
    }

    const { nodes } = layout;
    const highlighted = this.#dependencies.highlightedEntities();

    for (const edge of this.#renderEdges) {
      const source = nodes[edge.sourceIdx];
      const target = nodes[edge.targetIdx];

      if (!source || !target) {
        continue;
      }

      const ax = source.x ?? 0;
      const ay = source.y ?? 0;
      const bx = target.x ?? 0;
      const by = target.y ?? 0;
      const dx = bx - ax;
      const dy = by - ay;
      const chord = Math.hypot(dx, dy);

      if (chord <= 0.001) {
        continue;
      }

      const startDistance = source.radius + FLAT_EDGE_WIDTH_WORLD;
      const endDistance = target.radius + FLAT_EDGE_WIDTH_WORLD;
      const visibleChord = chord - startDistance - endDistance;
      if (visibleChord <= FLAT_EDGE_WIDTH_WORLD) {
        continue;
      }

      const ux = dx / chord;
      const uy = dy / chord;
      const sx = ax + ux * startDistance;
      const sy = ay + uy * startDistance;
      const tx = bx - ux * endDistance;
      const ty = by - uy * endDistance;
      const edgeEndInset = Math.min(
        FLAT_EDGE_WIDTH_WORLD * 0.9,
        visibleChord * 0.35,
      );
      const edgeTx = tx - ux * edgeEndInset;
      const edgeTy = ty - uy * edgeEndInset;
      const visibleDx = edgeTx - sx;
      const visibleDy = edgeTy - sy;

      // An edge stays full only when both endpoints are highlighted.
      const full =
        highlighted.size === 0 ||
        (highlighted.has(entityIndexFromNodeId(source.id)) &&
          highlighted.has(entityIndexFromNodeId(target.id)));
      const color = full ? edge.color : dimColor(edge.color);

      sink.push(
        {
          p0: [sx, sy],
          p1: [sx + visibleDx / 3, sy + visibleDy / 3],
          p2: [sx + (2 * visibleDx) / 3, sy + (2 * visibleDy) / 3],
          p3: [edgeTx, edgeTy],
        },
        color,
        FLAT_EDGE_WIDTH_WORLD,
        undefined,
        undefined,
        edge.linkEntityIdx,
      );

      const arrowSize = FLAT_EDGE_WIDTH_WORLD;
      const arrowInset = Math.min(
        FLAT_EDGE_WIDTH_WORLD * 0.45,
        visibleChord * 0.2,
      );

      arrowsOut.push({
        kind: "endpoint",
        x: tx + ux * arrowInset,
        y: ty + uy * arrowInset,
        angle: Math.atan2(dy, dx),
        size: arrowSize,
        color,
        chord: visibleChord,
      });
    }
  }
}
