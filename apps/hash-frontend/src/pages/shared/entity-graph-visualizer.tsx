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
import { Entity } from "@local/hash-graph-sdk/entity";

export type EntityForGraph = {
  linkData?: LinkData;
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeId"> &
    Partial<Pick<EntityMetadata, "temporalVersioning">>;
  properties: PropertyObject;
};

export const EntityGraphVisualizer = <T extends EntityForGraph>({
  entities,
  filterEntity,
  isPrimaryEntity,
  subgraphWithTypes,
  onEntityClick,
  onEntityTypeClick,
}: {
  entities?: T[];
  filterEntity?: (entity: T) => boolean;
  onEntityClick?: (entityId: EntityId) => void;
  onEntityTypeClick?: (entityTypeId: VersionedUrl) => void;
  isPrimaryEntity?: (entity: T) => boolean;
  subgraphWithTypes: Subgraph;
}) => {
  const { palette } = useTheme();

  const nonLinkEntities = useMemo(
    () =>
      entities?.filter(
        (entity) =>
          !entity.linkData && (filterEntity ? filterEntity(entity) : true),
      ),
    [entities, filterEntity],
  );

  const linkEntities = useMemo(
    () =>
      entities && nonLinkEntities
        ? entities.filter(
            (
              entity,
            ): entity is T & {
              linkData: NonNullable<T["linkData"]>;
            } =>
              !!entity.linkData &&
              nonLinkEntities.some(
                (nonLinkEntity) =>
                  entity.linkData!.leftEntityId ===
                  nonLinkEntity.metadata.recordId.entityId,
              ) &&
              nonLinkEntities.some(
                (nonLinkEntity) =>
                  entity.linkData!.rightEntityId ===
                  nonLinkEntity.metadata.recordId.entityId,
              ),
          )
        : undefined,
    [entities, nonLinkEntities],
  );

  const { nodes, edges } = useMemo<{
    nodes: GraphVizNode[];
    edges: GraphVizEdge[];
  }>(() => {
    const nodesToAdd: GraphVizNode[] = [];
    const edgesToAdd: GraphVizEdge[] = [];

    const typesAlreadyAdded: Set<VersionedUrl> = new Set();

    const nonLinkEntitiesSeen = new Set<EntityId>();
    const linkEntitiesToAdd: Entity[] = [];

    for (const entity of nonLinkEntities ?? []) {
      nodesToAdd.push({
        label: generateEntityLabel(subgraphWithTypes, entity),
        nodeId: entity.metadata.recordId.entityId,
        color: isPrimaryEntity ? palette.blue[30] : palette.blue[20],
        borderColor: isPrimaryEntity ? palette.blue[40] : palette.blue[30],
        size: 14,
      });

      const entityType = getEntityTypeById(
        subgraphWithTypes,
        entity.metadata.entityTypeId,
      );

      if (entityType) {
        const {
          schema: { title, $id },
        } = entityType;

        if (!typesAlreadyAdded.has($id)) {
          typesAlreadyAdded.add($id);

          nodesToAdd.push({
            label: title,
            nodeId: $id,
            color: palette.blue[70],
            size: 15,
          });
        }

        edgesToAdd.push({
          source: entity.metadata.recordId.entityId,
          target: $id,
          edgeId: `${entity.metadata.recordId.entityId}~${$id}`,
          label: "is of type",
          size: 3,
        });
      }
    }

    for (const linkEntity of linkEntities ?? []) {
      const linkEntityType = getEntityTypeById(
        subgraphWithTypes,
        linkEntity.metadata.entityTypeId,
      );

      edgesToAdd.push({
        source: linkEntity.linkData.leftEntityId,
        target: linkEntity.linkData.rightEntityId,
        edgeId: linkEntity.metadata.recordId.entityId,
        label: linkEntityType?.schema.title ?? "Unknown",
        size: 3,
      });
    }

    return {
      nodes: nodesToAdd,
      edges: edgesToAdd,
    };
  }, [
    isPrimaryEntity,
    linkEntities,
    nonLinkEntities,
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
