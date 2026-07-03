/**
 * Leaf components for the HTML overlays the Scene drives (hover cards, the pinned
 * selection card, hub labels). Each subscribes to exactly the {@link SceneOverlayStore}
 * slice it renders, so the Scene's per-frame position re-emissions re-render only the
 * one affected leaf — never the bridge component that owns the worker and data flow.
 */
import { useCallback } from "react";

import { NodeLabelOverlay } from "../components/node-label-overlay";
import { useOverlaySlice } from "../components/scene-overlay-store";
import { FrontierClusterCard } from "./frontier-cluster-card";
import { HighwaySummaryCard } from "./highway-summary-card";
import { EntityHoverCard } from "./hover-card";

import type { SceneOverlayStore } from "../components/scene-overlay-store";
import type { EntityCardContext } from "./frontier-expansion-store";
import type { EntityId } from "@blockprotocol/type-system";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";

interface EntityCardResolvers {
  readonly getCardContext: (
    entityId: EntityId,
  ) => EntityCardContext | undefined;
  readonly degreeById: ReadonlyMap<EntityId, number>;
}

/**
 * The transient hover card over a flat-tier dot. Suppressed while that same dot is
 * pinned (selected) so the two cards don't stack.
 */
export const EntityHoverOverlay: React.FC<
  EntityCardResolvers & {
    readonly overlayStore: SceneOverlayStore<EntityId>;
  }
> = ({ overlayStore, getCardContext, degreeById }) => {
  const hover = useOverlaySlice(overlayStore.nodeHover);
  const selection = useOverlaySlice(overlayStore.selection);

  if (hover === null || hover.nodeId === selection?.nodeId) {
    return null;
  }

  const context = getCardContext(hover.nodeId);
  if (context === undefined) {
    return null;
  }

  return (
    <EntityHoverCard
      entity={context.entity}
      closedMultiEntityTypesRootMap={context.rootMap}
      definitions={context.definitions}
      degree={degreeById.get(hover.nodeId) ?? 0}
      x={hover.x}
      y={hover.y}
    />
  );
};

interface SelectionOverlayProps extends EntityCardResolvers {
  readonly overlayStore: SceneOverlayStore<EntityId>;
  readonly onEntityClick?: (entityId: EntityId) => void;
}

/**
 * The selected entity's pinned card (with an Open action) that tracks the node's
 * on-screen position; the Scene re-emits the position through settle + pan/zoom.
 */
export const SelectionOverlay: React.FC<SelectionOverlayProps> = ({
  overlayStore,
  getCardContext,
  degreeById,
  onEntityClick,
}) => {
  const selection = useOverlaySlice(overlayStore.selection);

  // Keyed on the id, not the per-frame selection object, so the memoized card body
  // stays referentially stable while the card tracks the node across pan frames.
  const selectedEntityId = selection?.nodeId;
  const handleOpen = useCallback(() => {
    if (selectedEntityId !== undefined) {
      onEntityClick?.(selectedEntityId);
    }
  }, [onEntityClick, selectedEntityId]);

  if (selection === null) {
    return null;
  }

  const context = getCardContext(selection.nodeId);
  if (context === undefined) {
    return null;
  }

  return (
    <EntityHoverCard
      entity={context.entity}
      closedMultiEntityTypesRootMap={context.rootMap}
      definitions={context.definitions}
      degree={degreeById.get(selection.nodeId) ?? 0}
      x={selection.x}
      y={selection.y}
      onOpen={onEntityClick ? handleOpen : undefined}
    />
  );
};

interface HighwayHoverOverlayProps {
  readonly overlayStore: SceneOverlayStore<EntityId>;
  readonly closedMultiEntityTypesRootMap:
    | ClosedMultiEntityTypesRootMap
    | undefined;
}

/** The hovered aggregated-highway summary card, anchored to the lane. */
export const HighwayHoverOverlay = ({
  overlayStore,
  closedMultiEntityTypesRootMap,
}: HighwayHoverOverlayProps) => {
  const highwayHover = useOverlaySlice(overlayStore.highwayHover);

  if (highwayHover === null) {
    return null;
  }

  return (
    <HighwaySummaryCard
      typeId={highwayHover.typeId}
      typeLabel={highwayHover.typeLabel}
      count={highwayHover.count}
      direction={highwayHover.direction}
      closedMultiEntityTypesRootMap={closedMultiEntityTypesRootMap}
      x={highwayHover.x}
      y={highwayHover.y}
    />
  );
};

interface ClusterHoverOverlayProps {
  readonly overlayStore: SceneOverlayStore<EntityId>;
  readonly isFetching: boolean;
  readonly onLoadFrontier: (entityIds: readonly EntityId[]) => void;
}

/**
 * The interactive load card at a wholly-frontier cluster bubble's edge. The store keeps
 * it open across the cursor's bubble-to-card handoff; Load expands every frontier entity
 * the bubble holds (read from the live slice, so the handler stays stable per frame)
 * and dismisses the card.
 */
export const ClusterHoverOverlay = ({
  overlayStore,
  isFetching,
  onLoadFrontier,
}: ClusterHoverOverlayProps) => {
  const clusterHover = useOverlaySlice(overlayStore.clusterHover);

  const handleLoad = useCallback(() => {
    const hover = overlayStore.clusterHover.getValue();
    overlayStore.dismissClusterCard();
    if (hover !== null) {
      onLoadFrontier(hover.frontierEntityIds);
    }
  }, [overlayStore, onLoadFrontier]);

  if (clusterHover === null) {
    return null;
  }

  return (
    <FrontierClusterCard
      count={clusterHover.count}
      x={clusterHover.x}
      y={clusterHover.y}
      radiusPx={clusterHover.radiusPx}
      isFetching={isFetching}
      onLoad={handleLoad}
      onMouseEnter={overlayStore.handleClusterCardEnter}
      onMouseLeave={overlayStore.handleClusterCardLeave}
    />
  );
};

interface EntityLabelsOverlayProps {
  readonly overlayStore: SceneOverlayStore<EntityId>;
}

/**
 * The always-on hub labels, re-emitted by the Scene each frame with current on-screen
 * positions so they track the camera + settling layout.
 */
export const EntityLabelsOverlay = ({
  overlayStore,
}: EntityLabelsOverlayProps) => {
  const labels = useOverlaySlice(overlayStore.nodeLabels);

  return <NodeLabelOverlay labels={labels} />;
};
