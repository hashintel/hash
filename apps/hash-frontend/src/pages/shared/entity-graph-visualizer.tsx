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
import { Box, Stack, useTheme } from "@mui/material";
import type { ReactElement, RefObject } from "react";
import { memo, useCallback, useMemo, useState } from "react";

import type {
  GraphVisualizerProps,
  GraphVizEdge,
  GraphVizNode,
} from "./graph-visualizer";
import { GraphVisualizer } from "./graph-visualizer";
import type { GraphVizConfig } from "./graph-visualizer/graph-container/shared/config-control";

export type EntityForGraph = {
  linkData?: LinkData;
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeId"> &
    Partial<Pick<EntityMetadata, "temporalVersioning">>;
  properties: PropertyObject;
};

const defaultConfig = {
  graphKey: "entity-graph",
  nodeHighlighting: {
    depth: 1,
    direction: "All",
  },
  nodeSizing: {
    mode: "byEdgeCount",
    min: 10,
    max: 32,
    countEdges: "All",
  },
} as const satisfies GraphVizConfig;

export const EntityGraphVisualizer = memo(
  <T extends EntityForGraph>({
    entities,
    isPrimaryEntity,
    loadingComponent,
    subgraphWithTypes,
    onEntityClick,
    onEntityTypeClick,
  }: {
    entities?: T[];
    onEntityClick?: (
      entityId: EntityId,
      containerRef?: RefObject<HTMLDivElement>,
    ) => void;
    onEntityTypeClick?: (entityTypeId: VersionedUrl) => void;
    /**
     * Whether this entity should receive a special highlight.
     */
    isPrimaryEntity?: (entity: T) => boolean;
    loadingComponent?: ReactElement;
    subgraphWithTypes: Subgraph;
  }) => {
    const { palette } = useTheme();

    const [loading, setLoading] = useState(true);

    const nodeColors = useMemo(() => {
      return [
        {
          color: palette.blue[30],
          borderColor: palette.gray[50],
        },
        {
          color: palette.purple[30],
          borderColor: palette.gray[50],
        },
        {
          color: palette.green[50],
          borderColor: palette.gray[50],
        },
        {
          color: palette.red[20],
          borderColor: palette.gray[50],
        },
        {
          color: palette.yellow[30],
          borderColor: palette.gray[50],
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

      for (const entity of entities ?? []) {
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

        const entityType = getEntityTypeById(
          subgraphWithTypes,
          entity.metadata.entityTypeId,
        );

        if (!entityType) {
          throw new Error(
            `Could not find entity type for ${entity.metadata.entityTypeId}`,
          );
        }

        nodesToAddByNodeId[entity.metadata.recordId.entityId] = {
          label: generateEntityLabel(subgraphWithTypes, entity),
          nodeId: entity.metadata.recordId.entityId,
          nodeTypeId: entity.metadata.entityTypeId,
          nodeTypeLabel: entityType.schema.title,
          color,
          borderColor,
          size: defaultConfig.nodeSizing.min,
        };
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
      }

      return {
        nodes: Object.values(nodesToAddByNodeId),
        edges: edgesToAdd,
      };
    }, [entities, isPrimaryEntity, nodeColors, palette, subgraphWithTypes]);

    const onNodeClick = useCallback<
      NonNullable<GraphVisualizerProps["onNodeSecondClick"]>
    >(
      ({ nodeId, screenContainerRef }) => {
        if (isEntityId(nodeId)) {
          onEntityClick?.(nodeId, screenContainerRef);
        } else {
          onEntityTypeClick?.(nodeId as VersionedUrl);
        }
      },
      [onEntityClick, onEntityTypeClick],
    );

    const onEdgeClick = useCallback<
      NonNullable<GraphVisualizerProps["onEdgeClick"]>
    >(
      ({ edgeId, screenContainerRef }) => {
        if (isEntityId(edgeId)) {
          onEntityClick?.(edgeId, screenContainerRef);
        }
      },
      [onEntityClick],
    );

    const onRender = useCallback(() => setLoading(false), []);

    return (
      <Box sx={{ height: "100%" }}>
        {loading && loadingComponent && (
          <Stack
            alignItems="center"
            justifyContent="center"
            sx={{ height: "100%", width: "100%" }}
          >
            <Box>{loadingComponent}</Box>
          </Stack>
        )}
        <GraphVisualizer
          defaultConfig={defaultConfig}
          nodes={nodes}
          edges={edges}
          onNodeSecondClick={onNodeClick}
          onEdgeClick={onEdgeClick}
          onRender={onRender}
        />
      </Box>
    );
  },
);
