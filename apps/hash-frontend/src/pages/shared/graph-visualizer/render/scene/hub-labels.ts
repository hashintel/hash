/**
 * Always-on hub labels, overlaid as HTML by React: which dots label is a
 * cached eligibility set (rebuilt only on zoom/structure change); each frame
 * re-projects that set to screen, culls to the viewport, resolves
 * label-box collisions, and emits.
 */
import {
  FLAT_HEADER_BYTES,
  FLAT_RADIUS_BYTE_OFFSET,
  FLAT_RECORD_BYTES,
} from "../../worker/buffers/position-buffer";
import { radiusForDegree } from "../../worker/entity-style";
import { liveNodeGeometry } from "./geometry";

import type { ClusterId } from "../../ids";
import type { WorkerHandle } from "../worker-connection";
import type { EntityLabel, SceneCallbacks } from "./callbacks";
import type { EntityId } from "@blockprotocol/type-system";
import type { Deck, OrthographicView } from "@deck.gl/core";

/**
 * Minimum on-screen dot diameter (px) for its entity label to be eligible. Under OrthographicView
 * one world unit is `2 ** zoom` px, so a dot of `worldRadius` clears this once
 * `worldRadius * 2 * 2 ** zoom > ENTITY_LABEL_MIN_SCREEN_DIAMETER`. This is the on-screen-size bar;
 * which dots are hubs is a separate by-radius cut (see {@link HUB_LABEL_MIN_RADIUS}). Ordinary
 * entities are never labelled; their detail is hover-only (the card).
 */
const ENTITY_LABEL_MIN_SCREEN_DIAMETER = 24;

/**
 * Hub selection for always-on labels. A dot is a hub by its by-degree radius -- the worker's
 * authoritative connectivity (it sizes every dot this way, counting links a main-thread prop tally
 * would miss, e.g. frontier-expansion links). Eligible = radius of at least a {@link
 * HUB_LABEL_MIN_DEGREE}-degree node; of those (and on-screen-large enough), only the largest
 * {@link HUB_LABEL_MAX_COUNT} are labelled, so the labels orient the view without crowding it.
 */
const HUB_LABEL_MIN_DEGREE = 4;
const HUB_LABEL_MIN_RADIUS = radiusForDegree(HUB_LABEL_MIN_DEGREE);
const HUB_LABEL_MAX_COUNT = 12;

/**
 * Off-screen margin (px) for culling HTML entity labels: keep a label whose dot sits just past the
 * edge (so it shows partially) but drop the rest, so React only renders what's on screen.
 */
const ENTITY_LABEL_CULL_MARGIN_PX = 80;

/** Gap (px) between a hub dot's edge and its label, which sits to the dot's right. */
const ENTITY_LABEL_GAP_PX = 6;
const ENTITY_LABEL_MAX_WIDTH_PX = 180;
const ENTITY_LABEL_HEIGHT_PX = 22;
const ENTITY_LABEL_APPROX_CHAR_WIDTH_PX = 7;
const ENTITY_LABEL_COLLISION_PADDING_PX = 4;

/**
 * Cached hub-label eligibility set. Rebuilt on zoom/structure change;
 * each frame projects SAB positions and emits on-screen labels.
 */
interface EntityLabelDatum {
  readonly layoutId: ClusterId;
  readonly recordIndex: number;
  readonly entityId: EntityId;
  readonly text: string;
  /** The dot's world radius, so the label can sit just below the dot's edge at any zoom. */
  readonly worldRadius: number;
}

export interface HubLabelsDependencies {
  readonly handle: WorkerHandle;
  readonly deck: () => Deck<OrthographicView>;
  readonly callbacks: () => SceneCallbacks;
  readonly zoom: () => number;
}

export class HubLabels {
  readonly #dependencies: HubLabelsDependencies;

  /** Hub-label eligibility + resolved text. Rebuilt on zoom/structure change. */
  #data: EntityLabelDatum[] = [];
  #frame: number | null = null;
  /** Signature of the last hub-label set emitted to React; skips setState when unchanged. */
  #lastEmittedSignature = "";

  constructor(dependencies: HubLabelsDependencies) {
    this.#dependencies = dependencies;
  }

  dispose(): void {
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
    }
  }

  /**
   * Recompute which dots label + their text. O(dots) scan; fires only on
   * zoom/structure change (position frames reuse the cached set). A dot labels
   * once its screen diameter clears {@link ENTITY_LABEL_MIN_SCREEN_DIAMETER}.
   */
  rebuild(): void {
    const resolveLabel = this.#dependencies.callbacks().resolveEntityLabel;
    const structure = this.#dependencies.handle.getStructure();
    if (resolveLabel === undefined || structure === undefined) {
      this.#data = [];
      return;
    }
    const scale = 2 ** this.#dependencies.zoom();
    const data: EntityLabelDatum[] = [];
    const push = (
      layoutId: ClusterId,
      recordIndex: number,
      worldRadius: number,
    ): void => {
      const entityId = this.#dependencies.handle.resolveEntityId(
        layoutId,
        recordIndex,
      );
      if (entityId === undefined) {
        return;
      }
      const text = resolveLabel(entityId);
      if (text !== undefined && text.length > 0) {
        data.push({ layoutId, recordIndex, entityId, text, worldRadius });
      }
    };

    // Flat tier: one whole-graph SAB. Each record carries its by-degree radius (the worker's
    // connectivity authority). A dot is a hub candidate when that radius marks it as connected
    // enough and it is large enough on screen; of the candidates, only the largest few are kept so
    // the labels orient the view. (Ranking by radius, not a main-thread degree tally, is what lets
    // a node enlarged by frontier expansion still read as a hub.)
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
            radius >= HUB_LABEL_MIN_RADIUS &&
            radius * 2 * scale > ENTITY_LABEL_MIN_SCREEN_DIAMETER
          ) {
            candidates.push({ index, radius });
          }
        }
        candidates.sort((lhs, rhs) => rhs.radius - lhs.radius);
        for (const candidate of candidates.slice(0, HUB_LABEL_MAX_COUNT)) {
          push(flatGraph.layoutId, candidate.index, candidate.radius);
        }
      }
    }

    this.#data = data;
  }

  /**
   * Project the cached hub-label set to screen and emit the on-screen ones for React to overlay as
   * HTML. Called wherever positions change (frame + view change), so the labels track the camera /
   * settle. The hub set (which hubs + text) is not recomputed here (that is the gated
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
    const onLabels = this.#dependencies.callbacks().onEntityLabels;
    if (onLabels === undefined) {
      return;
    }
    const viewport = this.#dependencies.deck().getViewports()[0];
    if (!viewport) {
      return;
    }
    const margin = ENTITY_LABEL_CULL_MARGIN_PX;
    const maxX = viewport.width + margin;
    const maxY = viewport.height + margin;
    const scale = 2 ** this.#dependencies.zoom();
    const labels: EntityLabel[] = [];
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
      const labelX = x + datum.worldRadius * scale + ENTITY_LABEL_GAP_PX;
      const labelWidth = Math.min(
        ENTITY_LABEL_MAX_WIDTH_PX,
        datum.text.length * ENTITY_LABEL_APPROX_CHAR_WIDTH_PX + 14,
      );
      const rect = {
        left: labelX - ENTITY_LABEL_COLLISION_PADDING_PX,
        right: labelX + labelWidth + ENTITY_LABEL_COLLISION_PADDING_PX,
        top: y - ENTITY_LABEL_HEIGHT_PX / 2 - ENTITY_LABEL_COLLISION_PADDING_PX,
        bottom:
          y + ENTITY_LABEL_HEIGHT_PX / 2 + ENTITY_LABEL_COLLISION_PADDING_PX,
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
      labels.push({ entityId: datum.entityId, text: datum.text, x: labelX, y });
    }
    // Skip the React setState when the projected label set is unchanged
    // (positions rounded to whole pixels so sub-pixel drift is invisible).
    const signature = labels
      .map(
        (label) =>
          `${label.entityId}|${Math.round(label.x)}|${Math.round(label.y)}|${label.text}`,
      )
      .join(";");
    if (signature === this.#lastEmittedSignature) {
      return;
    }
    this.#lastEmittedSignature = signature;
    onLabels(labels);
  }
}
