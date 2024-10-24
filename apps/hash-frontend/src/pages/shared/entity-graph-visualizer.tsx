import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import type {
  EntityId,
  EntityMetadata,
  LinkData,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { Subgraph } from "@local/hash-subgraph";
import { isEntityId } from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/stdlib";
import { Box, Stack, useTheme } from "@mui/material";
import type { ReactElement, RefObject } from "react";
import { memo, useCallback, useMemo, useState } from "react";

import type { EntityEditorProps } from "../[shortname]/entities/[entity-uuid].page/entity-editor";
import type {
  DynamicNodeSizing,
  GraphVisualizerProps,
  GraphVizConfig,
  GraphVizEdge,
  GraphVizFilters,
  GraphVizNode,
} from "./graph-visualizer";
import { GraphVisualizer } from "./graph-visualizer";

export type EntityForGraph = {
  linkData?: LinkData;
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeId"> &
    Partial<Pick<EntityMetadata, "temporalVersioning">>;
  properties: PropertyObject;
};

const fallbackDefaultConfig = {
  graphKey: "entity-graph",
  edgeSizing: {
    min: 2,
    max: 5,
    nonHighlightedVisibleSizeThreshold: 2,
    scale: "Linear",
  },
  nodeHighlighting: {
    depth: 1,
    direction: "All",
  },
  nodeSizing: {
    mode: "byEdgeCount",
    min: 10,
    max: 32,
    countEdges: "All",
    scale: "Linear",
  },
} as const satisfies GraphVizConfig<DynamicNodeSizing>;

export const EntityGraphVisualizer = memo(
  <T extends EntityForGraph>({
    defaultConfig: defaultConfigFromProps,
    defaultFilters,
    entities,
    fullScreenMode,
    isPrimaryEntity,
    loadingComponent,
    subgraphWithTypes,
    onEntityClick,
    onEntityTypeClick,
  }: {
    defaultConfig?: GraphVizConfig<DynamicNodeSizing>;
    defaultFilters?: GraphVizFilters;
    fullScreenMode?: "document" | "element";
    entities?: T[];
    onEntityClick?: (
      entityId: EntityId,
      containerRef?: RefObject<HTMLDivElement>,
      options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
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

    const defaultConfig = defaultConfigFromProps ?? fallbackDefaultConfig;

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

      const entityTypesById: Record<string, EntityTypeWithMetadata> = {};

      const entityTypeIdToColor = new Map<string, number>();

      const linkEntityIdsSeen = new Set<EntityId>();

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
          linkEntityIdsSeen.add(entity.metadata.recordId.entityId);
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

        const entityType =
          entityTypesById[entity.metadata.entityTypeId] ??
          getEntityTypeById(subgraphWithTypes, entity.metadata.entityTypeId);

        if (!entityType) {
          throw new Error(
            `Could not find entity type for ${entity.metadata.entityTypeId}`,
          );
        }

        entityTypesById[entity.metadata.entityTypeId] ??= entityType;

        nodesToAddByNodeId[entity.metadata.recordId.entityId] = {
          icon: entityType.metadata.icon ?? undefined,
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
          /**
           * The target may be a link entity or a regular entity.
           * If we haven't seen either as a target, we don't want to add this link.
           */
          (!linkEntityIdsSeen.has(linkEntity.linkData.rightEntityId) &&
            !nonLinkEntitiesIncluded.has(linkEntity.linkData.rightEntityId))
        ) {
          /**
           * We don't have both sides of this link in the graph.
           */
          continue;
        }

        edgesToAdd.push({
          source: linkEntity.linkData.leftEntityId,
          target: linkEntity.linkData.rightEntityId,
          edgeId: linkEntity.metadata.recordId.entityId,
          edgeTypeId: linkEntity.metadata.entityTypeId,
          size: 1,
        });
      }

      return {
        nodes: Object.values(nodesToAddByNodeId),
        edges: edgesToAdd,
      };
    }, [
      defaultConfig.nodeSizing,
      entities,
      isPrimaryEntity,
      nodeColors,
      palette,
      subgraphWithTypes,
    ]);

    const onNodeClick = useCallback<
      NonNullable<GraphVisualizerProps<DynamicNodeSizing>["onNodeSecondClick"]>
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
      NonNullable<GraphVisualizerProps<DynamicNodeSizing>["onEdgeClick"]>
    >(
      ({ edgeData, screenContainerRef }) => {
        onEntityClick?.(edgeData.source as EntityId, screenContainerRef, {
          defaultOutgoingLinkFilters: {
            linkedTo: new Set([edgeData.target]),
            linkType: new Set([edgeData.edgeTypeId!]),
          },
        });
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
          defaultFilters={defaultFilters}
          fullScreenMode={fullScreenMode}
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
