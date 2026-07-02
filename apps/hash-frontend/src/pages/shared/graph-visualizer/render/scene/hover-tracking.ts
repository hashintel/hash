/**
 * Hover-card state: the hovered entity dot (card at the cursor), the hovered
 * highway (summary anchored to a world point), and the hovered wholly-frontier
 * cluster bubble (load card anchored to the bubble). The anchored cards are
 * re-emitted on every frame / camera move so they track pan + settle.
 */
import type { ClusterId } from "../../ids";
import type { PlacedCluster } from "../clusters";
import type { WorkerHandle } from "../worker-connection";
import type { SceneCallbacks } from "./callbacks";
import type { EntityId } from "@blockprotocol/type-system";
import type { Deck, OrthographicView } from "@deck.gl/core";

export interface HoverTrackerDependencies {
  readonly handle: WorkerHandle;
  readonly deck: () => Deck<OrthographicView>;
  readonly callbacks: () => SceneCallbacks;
  /** The persistent cluster-bubble set (positions mutate in place per tick). */
  readonly placed: () => readonly PlacedCluster[];
  readonly zoom: () => number;
}

export class HoverTracker {
  readonly #dependencies: HoverTrackerDependencies;

  #hoveredEntity: EntityId | null = null;

  /**
   * The hovered highway's lane + the hovered point in WORLD space. Kept so the summary card tracks
   * the highway as the camera pans / the layout settles -- re-projected by {@link emitHighwayHover}
   * on every view change + frame, the same way the pinned selection card tracks its node.
   */
  #hoveredHighway: { laneId: number; worldX: number; worldY: number } | null =
    null;

  /**
   * The hovered wholly-frontier cluster bubble, by id. Kept so the load card tracks the bubble as
   * the camera pans / the layout settles -- re-projected by {@link emitClusterHover} on every view
   * change + frame, like {@link #hoveredHighway}. Its frontier data is read live from the placed set.
   */
  #hoveredClusterId: ClusterId | null = null;

  constructor(dependencies: HoverTrackerDependencies) {
    this.#dependencies = dependencies;
  }

  /** An entity dot (or a flat link edge) is hovered: card at the cursor. */
  setEntity(entityId: EntityId, x: number, y: number): void {
    this.#hoveredEntity = entityId;
    this.#dependencies.callbacks().onEntityHover?.({ entityId, x, y });
    this.clearHighway();
    this.clearCluster();
  }

  /**
   * A highway is hovered: anchor the summary to the hovered point in WORLD space so it tracks
   * the highway as the camera pans / the layout settles (re-projected by
   * {@link emitHighwayHover}), like the pinned card.
   */
  setHighway(laneId: number, screenX: number, screenY: number): void {
    this.clearEntity();
    this.clearCluster();
    const world = this.#viewport()?.unproject([screenX, screenY]);
    this.#hoveredHighway =
      world === undefined
        ? null
        : { laneId, worldX: world[0] ?? 0, worldY: world[1] ?? 0 };
    this.emitHighwayHover();
  }

  /** A wholly-frontier bubble is hovered: the load card tracks it through pan / settle. */
  setCluster(clusterId: ClusterId): void {
    this.clearEntity();
    this.clearHighway();
    this.#hoveredClusterId = clusterId;
    this.emitClusterHover();
  }

  /** Hide the hover card (the cursor left the dots, or a pan started under it). */
  clearEntity(): void {
    if (this.#hoveredEntity !== null) {
      this.#hoveredEntity = null;
      this.#dependencies.callbacks().onEntityHover?.(null);
    }
  }

  /** Clear the highway summary (cursor left it, or a dot/link took over). */
  clearHighway(): void {
    this.#hoveredHighway = null;
    this.#dependencies.callbacks().onHighwayHover?.(null);
  }

  /** Clear the load card (cursor left the bubble, or a dot/edge/highway took over). */
  clearCluster(): void {
    if (this.#hoveredClusterId === null) {
      return;
    }
    this.#hoveredClusterId = null;
    this.#dependencies.callbacks().onClusterHover?.(null);
  }

  clearAll(): void {
    this.clearEntity();
    this.clearHighway();
    this.clearCluster();
  }

  /** Re-project both anchored cards (positions moved or the camera did). */
  emitAnchored(): void {
    this.emitHighwayHover();
    this.emitClusterHover();
  }

  /**
   * Re-project the hovered highway's world anchor to screen and re-emit its summary, so the card
   * tracks the highway through a pan / settle. No-op when nothing is hovered.
   */
  emitHighwayHover(): void {
    if (this.#hoveredHighway === null) {
      return;
    }
    const lane =
      this.#dependencies.handle.getStructure()?.highwayLanes[
        this.#hoveredHighway.laneId
      ];
    const viewport = this.#viewport();
    if (!lane || lane.count === 0 || !viewport) {
      return;
    }
    const projected = viewport.project([
      this.#hoveredHighway.worldX,
      this.#hoveredHighway.worldY,
    ]);
    const x = projected[0];
    const y = projected[1];
    if (x === undefined || y === undefined) {
      return;
    }
    this.#dependencies.callbacks().onHighwayHover?.({
      typeId: lane.typeId,
      typeLabel: lane.typeLabel,
      count: lane.count,
      direction: lane.direction,
      x,
      y,
    });
  }

  /**
   * Re-project the hovered frontier bubble to screen and re-emit its load summary, so the card
   * tracks the bubble through a pan / settle. No-op when nothing is hovered or the bubble is no
   * longer a wholly-frontier one.
   */
  emitClusterHover(): void {
    if (this.#hoveredClusterId === null) {
      return;
    }
    const placed = this.#dependencies
      .placed()
      .find((entry) => entry.cluster.id === this.#hoveredClusterId);
    const frontierIds = placed?.cluster.frontierEntityIds;
    const viewport = this.#viewport();
    if (!placed || !frontierIds || frontierIds.length === 0 || !viewport) {
      return;
    }
    const projected = viewport.project([placed.x, placed.y]);
    const x = projected[0];
    const y = projected[1];
    if (x === undefined || y === undefined) {
      return;
    }
    this.#dependencies.callbacks().onClusterHover?.({
      count: placed.cluster.count,
      frontierEntityIds: frontierIds,
      x,
      y,
      radiusPx: placed.cluster.radius * 2 ** this.#dependencies.zoom(),
    });
  }

  #viewport() {
    return this.#dependencies.deck().getViewports()[0];
  }
}
