import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import type {
  EntityId,
  EntityMetadata,
  LinkData,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { Subgraph } from "@local/hash-subgraph";
import { isEntityId } from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/stdlib";
import { useTheme } from "@mui/material";
import { useCallback, useMemo } from "react";

import type {
  GraphVisualizerProps,
  GraphVizEdge,
  GraphVizNode,
} from "./graph-visualizer";
import { GraphVisualizer } from "./graph-visualizer";

export type EntityForGraph = {
  linkData?: LinkData;
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeId"> &
    Partial<Pick<EntityMetadata, "temporalVersioning">>;
  properties: PropertyObject;
};

const maxNodeSize = 32;
const minNodeSize = 10;

export const EntityGraphVisualizer = <T extends EntityForGraph>({
  entities,
  filterEntity,
  isPrimaryEntity,
  subgraphWithTypes,
  onEntityClick,
  onEntityTypeClick,
}: {
  entities?: T[];
  /**
   * A function to filter out entities from display. If the function returns false, the entity will not be displayed.
   */
  filterEntity?: (entity: T) => boolean;
  onEntityClick?: (entityId: EntityId) => void;
  onEntityTypeClick?: (entityTypeId: VersionedUrl) => void;
  /**
   * Whether this entity should receive a special highlight.
   */
  isPrimaryEntity?: (entity: T) => boolean;
  subgraphWithTypes: Subgraph;
}) => {
  const { palette } = useTheme();

  const nodeColors = useMemo(() => {
    return [
      {
        color: palette.blue[30],
        borderColor: palette.blue[40],
      },
      {
        color: palette.purple[30],
        borderColor: palette.purple[40],
      },
      {
        color: palette.green[50],
        borderColor: palette.green[60],
      },
    ] as const;
  }, [palette]);

  const { nodes, edges } = useMemo<{
    nodes: GraphVizNode[];
    edges: GraphVizEdge[];
  }>(() => {
    const nodesToAddByNodeId: Record<string, GraphVizNode> = {};
    const edgesToAdd: GraphVizEdge[] = [];

    const nonLinkEntitiesIncluded = new Set<EntityId>();
    const linkEntitiesToAdd: (T & {
      linkData: NonNullable<T["linkData"]>;
    })[] = [];

    const entityTypeIdToColor = new Map<string, number>();

    const nodeIdToIncomingEdges = new Map<string, number>();

    for (const entity of entities ?? []) {
      /**
       * If we have been provided a filter function, check it doesn't filter out the entity
       */
      if (filterEntity) {
        if (!filterEntity(entity)) {
          continue;
        }
      }

      if (entity.linkData) {
        /**
         * We process links afterwards, because we only want to add them if both source and target are in the graph.
         */
        linkEntitiesToAdd.push(
          entity as T & {
            linkData: NonNullable<T["linkData"]>;
          },
        );
        continue;
      }

      nonLinkEntitiesIncluded.add(entity.metadata.recordId.entityId);

      const specialHighlight = isPrimaryEntity?.(entity) ?? false;

      if (!entityTypeIdToColor.has(entity.metadata.entityTypeId)) {
        entityTypeIdToColor.set(
          entity.metadata.entityTypeId,
          entityTypeIdToColor.size % nodeColors.length,
        );
      }

      const { color, borderColor } = specialHighlight
        ? { color: palette.blue[50], borderColor: palette.blue[60] }
        : nodeColors[entityTypeIdToColor.get(entity.metadata.entityTypeId)!]!;

      nodesToAddByNodeId[entity.metadata.recordId.entityId] = {
        label: generateEntityLabel(subgraphWithTypes, entity),
        nodeId: entity.metadata.recordId.entityId,
        color,
        borderColor,
        size: minNodeSize,
      };

      nodeIdToIncomingEdges.set(entity.metadata.recordId.entityId, 0);
    }

    for (const linkEntity of linkEntitiesToAdd) {
      if (
        !nonLinkEntitiesIncluded.has(linkEntity.linkData.leftEntityId) ||
        !nonLinkEntitiesIncluded.has(linkEntity.linkData.rightEntityId)
      ) {
        /**
         * We don't have both sides of this link in the graph.
         */
        continue;
      }

      const linkEntityType = getEntityTypeById(
        subgraphWithTypes,
        linkEntity.metadata.entityTypeId,
      );

      edgesToAdd.push({
        source: linkEntity.linkData.leftEntityId,
        target: linkEntity.linkData.rightEntityId,
        edgeId: linkEntity.metadata.recordId.entityId,
        label: linkEntityType?.schema.title ?? "Unknown",
        size: 1,
      });

      nodeIdToIncomingEdges.set(
        linkEntity.linkData.rightEntityId,
        (nodeIdToIncomingEdges.get(linkEntity.linkData.rightEntityId) ?? 0) + 1,
      );
    }

    const fewestIncomingEdges = Math.min(...nodeIdToIncomingEdges.values());
    const mostIncomingEdges = Math.max(...nodeIdToIncomingEdges.values());

    const incomingEdgeRange = mostIncomingEdges - fewestIncomingEdges;

    /**
     * If incomingEdgeRange is 0, all nodes have the same number of incoming edges
     */
    if (incomingEdgeRange > 0) {
      for (const [nodeId, incomingEdges] of nodeIdToIncomingEdges) {
        if (!nodesToAddByNodeId[nodeId]) {
          continue;
        }

        const relativeEdgeCount = incomingEdges / incomingEdgeRange;

        const maxSizeIncrease = maxNodeSize - minNodeSize;

        /**
         * Scale the size of the node based on the number of incoming edges within the range of incoming edges
         */
        nodesToAddByNodeId[nodeId].size = Math.min(
          maxNodeSize,
          Math.max(
            minNodeSize,
            relativeEdgeCount * maxSizeIncrease + minNodeSize,
          ),
        );
      }
    }

    return {
      nodes: Object.values(nodesToAddByNodeId),
      edges: edgesToAdd,
    };
  }, [
    entities,
    filterEntity,
    isPrimaryEntity,
    nodeColors,
    palette,
    subgraphWithTypes,
  ]);

  const onNodeClick = useCallback<
    NonNullable<GraphVisualizerProps["onNodeClick"]>
  >(
    ({ nodeId, isFullScreen }) => {
      if (isFullScreen) {
        return;
      }

      if (isEntityId(nodeId)) {
        onEntityClick?.(nodeId);
      } else {
        onEntityTypeClick?.(nodeId as VersionedUrl);
      }
    },
    [onEntityClick, onEntityTypeClick],
  );

  const onEdgeClick = useCallback<
    NonNullable<GraphVisualizerProps["onEdgeClick"]>
  >(
    ({ edgeId, isFullScreen }) => {
      if (isFullScreen) {
        return;
      }

      if (isEntityId(edgeId)) {
        onEntityClick?.(edgeId);
      }
    },
    [onEntityClick],
  );

  return (
    <GraphVisualizer
      nodes={nodes}
      edges={edges}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
    />
  );
};
