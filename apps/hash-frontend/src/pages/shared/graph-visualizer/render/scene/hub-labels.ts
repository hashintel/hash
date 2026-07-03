/**
 * Always-on hub labels, overlaid as HTML by React: which dots label is a
 * cached eligibility set (rebuilt only on zoom/structure change); each frame
 * re-projects that set to screen, culls to the viewport, resolves
 * label-box collisions, and emits.
 *
 * Which dots are eligible is the host's {@link LabelPolicy}: the entity
 * lifecycle labels only the biggest hubs (a large graph would otherwise
 * drown in text); a type graph labels every node (small, and dots are
 * meaningless without their names).
 */
import {
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
} from "../../worker/buffers/position-buffer";
import { radiusForDegree } from "../../worker/entity-style";
import { liveNodeGeometry } from "./geometry";

import type { ClusterId } from "../../ids";
import type { NodeLabel, SceneCallbacks } from "./callbacks";
import type { SceneHandle } from "./handle";
import type { Deck, OrthographicView } from "@deck.gl/core";

/** Which dots get an always-on label. See {@link defaultLabelPolicy} for the entity defaults. */
export interface LabelPolicy {
  /**
   * Minimum world radius for a dot to be a label candidate. Dot radius is the worker's by-degree
   * sizing, so this is the "is it a hub?" cut, expressed in the radius currency the SAB records
   * carry. 0 makes every node a candidate.
   */
  readonly minRadius: number;
  /** Of the eligible candidates, only the largest `maxCount` label (screen-crowding cap). */
  readonly maxCount: number;
  /**
   * Minimum on-screen dot diameter (px) for its label to be eligible. Under OrthographicView one
   * world unit is `2 ** zoom` px, so a dot of `worldRadius` clears this once
   * `worldRadius * 2 * 2 ** zoom` exceeds it. 0 labels regardless of zoom.
   */
  readonly minScreenDiameter: number;
}

/**
 * The entity lifecycle's policy: only genuine hubs label (radius of at least a 4-degree node,
 * the 12 largest, and only once the dot reads at >= 24 px), so the labels orient the view
 * without crowding it. Ordinary entities are hover-only (the card).
 */
export const defaultLabelPolicy: LabelPolicy = {
  minRadius: radiusForDegree(4),
  maxCount: 12,
  minScreenDiameter: 24,
};

/**
 * Off-screen margin (px) for culling HTML node labels: keep a label whose dot sits just past the
 * edge (so it shows partially) but drop the rest, so React only renders what's on screen.
 */
const NODE_LABEL_CULL_MARGIN_PX = 80;

/** Gap (px) between a hub dot's edge and its label, which sits to the dot's right. */
const NODE_LABEL_GAP_PX = 6;
/**
 * Maximum label width (px) used to size its collision box.
 *
 * @defaultValue 180. Lower values collide (and hide) fewer neighbouring labels but truncate
 * long names sooner; higher values show more of the name at the cost of more collisions.
 */
const NODE_LABEL_MAX_WIDTH_PX = 180;
const NODE_LABEL_HEIGHT_PX = 22;
/**
 * Approximate glyph width (px) per character, used to estimate label width for collision boxes.
 *
 * @defaultValue 7. Cheaper than measuring actual text width on the canvas, at the cost of
 * collision boxes that are slightly off for unusually wide or narrow glyphs.
 */
const NODE_LABEL_APPROX_CHAR_WIDTH_PX = 7;
const NODE_LABEL_COLLISION_PADDING_PX = 4;

/**
 * Cached label eligibility set. Rebuilt on zoom/structure change;
 * each frame projects SAB positions and emits on-screen labels.
 */
interface NodeLabelDatum<NodeId extends string> {
  readonly layoutId: ClusterId;
  readonly recordIndex: number;
  readonly nodeId: NodeId;
  readonly text: string;
  /** The dot's world radius, so the label can sit just below the dot's edge at any zoom. */
  readonly worldRadius: number;
}

export interface HubLabelsDependencies<
  NodeId extends string,
  NodeIndex extends number,
  EdgeIndex extends number,
> {
  readonly handle: SceneHandle<NodeId, NodeIndex, EdgeIndex>;
  readonly deck: () => Deck<OrthographicView>;
  readonly callbacks: () => SceneCallbacks<NodeId>;
  readonly zoom: () => number;
  readonly labelPolicy: LabelPolicy;
}

export class HubLabels<
  NodeId extends string,
  NodeIndex extends number,
  EdgeIndex extends number,
> {
  readonly #dependencies: HubLabelsDependencies<NodeId, NodeIndex, EdgeIndex>;

  /** Label eligibility + resolved text. Rebuilt on zoom/structure change. */
  #data: NodeLabelDatum<NodeId>[] = [];
  #frame: number | null = null;
  /** Signature of the last emitted label set; skips callback when screen positions are unchanged. */
  #lastEmittedSignature = "";

  constructor(
    dependencies: HubLabelsDependencies<NodeId, NodeIndex, EdgeIndex>,
  ) {
    this.#dependencies = dependencies;
  }

  dispose(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
    }
  }

  /**
   * Recompute which dots label + their text. O(dots) scan; fires only on
   * zoom/structure change (position frames reuse the cached set). Eligibility
   * is the host's {@link LabelPolicy} (radius cut, count cap, screen size).
   */
  rebuild(): void {
    const resolveLabel = this.#dependencies.callbacks().resolveNodeLabel;
    const structure = this.#dependencies.handle.getStructure();
    if (resolveLabel === undefined || structure === undefined) {
      this.#data = [];
      return;
    }
    const policy = this.#dependencies.labelPolicy;
    const scale = 2 ** this.#dependencies.zoom();
    const data: NodeLabelDatum<NodeId>[] = [];
    const push = (
      layoutId: ClusterId,
      recordIndex: number,
      worldRadius: number,
    ): void => {
      const nodeId = this.#dependencies.handle.resolveNodeId(
        layoutId,
        recordIndex,
      );
      if (nodeId === undefined) {
        return;
      }
      const text = resolveLabel(nodeId);
      if (text !== undefined && text.length > 0) {
        data.push({ layoutId, recordIndex, nodeId, text, worldRadius });
      }
    };

    // Flat tier: one whole-graph SAB. Each record carries its by-degree radius (the worker's
    // connectivity authority). A dot is a candidate when that radius clears the policy's cut
    // and it is large enough on screen; of the candidates, only the largest `maxCount` are
    // kept. (Ranking by radius, not a main-thread degree tally, is what lets a node enlarged
    // by frontier expansion still read as a hub.)
    const flatGraph = structure.flatGraph;
    if (flatGraph !== undefined) {
      const cluster = this.#dependencies.handle
        .getClusters()
        .get(flatGraph.layoutId);
      if (cluster !== undefined) {
        const floats = new Float32Array(cluster.versionView.buffer);
        const candidates: { index: number; radius: number }[] = [];
        for (let index = 0; index < flatGraph.count; index++) {
          const recordBase =
            (FLAT_HEADER_BYTES + index * FLAT_RECORD_BYTES) / 4;
          const radius = floats[recordBase + FLAT_RADIUS_BYTE_OFFSET / 4] ?? 0;
          if (
            radius >= policy.minRadius &&
            (policy.minScreenDiameter === 0 ||
              radius * 2 * scale > policy.minScreenDiameter)
          ) {
            candidates.push({ index, radius });
          }
        }
        candidates.sort((lhs, rhs) => rhs.radius - lhs.radius);
        for (const candidate of candidates.slice(0, policy.maxCount)) {
          push(flatGraph.layoutId, candidate.index, candidate.radius);
        }
      }
    }

    this.#data = data;
  }

  /**
   * Project the cached label set to screen and emit the on-screen ones for React to overlay as
   * HTML. Called wherever positions change (frame + view change), so the labels track the camera /
   * settle. The label set (which dots + text) is not recomputed here (that is the gated
   * {@link rebuild}); only positions re-project, bounded by the set.
   */
  schedule(): void {
    if (this.#frame !== null) {
      return;
    }
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#emit();
    });
  }

  #emit(): void {
    const onLabels = this.#dependencies.callbacks().onNodeLabels;
    if (onLabels === undefined) {
      return;
    }
    const viewport = this.#dependencies.deck().getViewports()[0];
    if (!viewport) {
      return;
    }
    const margin = NODE_LABEL_CULL_MARGIN_PX;
    const maxX = viewport.width + margin;
    const maxY = viewport.height + margin;
    const scale = 2 ** this.#dependencies.zoom();
    const labels: NodeLabel<NodeId>[] = [];
    const occupied: {
      readonly left: number;
      readonly right: number;
      readonly top: number;
      readonly bottom: number;
    }[] = [];
    for (const datum of this.#data) {
      const geometry = liveNodeGeometry(
        this.#dependencies.handle,
        datum.layoutId,
        datum.recordIndex,
      );
      if (geometry === null) {
        continue;
      }
      const projected = viewport.project([geometry.x, geometry.y]);
      const x = projected[0];
      const y = projected[1];
      if (x === undefined || y === undefined) {
        continue;
      }
      if (x < -margin || y < -margin || x > maxX || y > maxY) {
        continue;
      }
      // Anchor to the right of the dot's edge (its radius scales with zoom), left-aligned and
      // vertically centred on the dot in React -- so the label reads "● Name" and its anchor is
      // the text start, which holds steady beside the dot as the camera zooms.
      const labelX = x + datum.worldRadius * scale + NODE_LABEL_GAP_PX;
      const labelWidth = Math.min(
        NODE_LABEL_MAX_WIDTH_PX,
        datum.text.length * NODE_LABEL_APPROX_CHAR_WIDTH_PX + 14,
      );
      const rect = {
        left: labelX - NODE_LABEL_COLLISION_PADDING_PX,
        right: labelX + labelWidth + NODE_LABEL_COLLISION_PADDING_PX,
        top: y - NODE_LABEL_HEIGHT_PX / 2 - NODE_LABEL_COLLISION_PADDING_PX,
        bottom: y + NODE_LABEL_HEIGHT_PX / 2 + NODE_LABEL_COLLISION_PADDING_PX,
      };
      if (
        occupied.some(
          (other) =>
            rect.left < other.right &&
            rect.right > other.left &&
            rect.top < other.bottom &&
            rect.bottom > other.top,
        )
      ) {
        continue;
      }
      occupied.push(rect);
      labels.push({ nodeId: datum.nodeId, text: datum.text, x: labelX, y });
    }
    // Skip the React setState when the projected label set is unchanged
    // (positions rounded to whole pixels so sub-pixel drift is invisible).
    const signature = labels
      .map(
        (label) =>
          `${label.nodeId}|${Math.round(label.x)}|${Math.round(label.y)}|${
            label.text
          }`,
      )
      .join(";");
    if (signature === this.#lastEmittedSignature) {
      return;
    }
    this.#lastEmittedSignature = signature;
    onLabels(labels);
  }
}
