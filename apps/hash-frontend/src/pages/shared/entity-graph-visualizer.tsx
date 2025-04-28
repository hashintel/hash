import type {
  ClosedMultiEntityType,
  EntityId,
  EntityMetadata,
  LinkData,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system";
import { isEntityId, mustHaveAtLeastOne } from "@blockprotocol/type-system";
import { ibm } from "@hashintel/design-system/palettes";
import {
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
} from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { Box, Stack, useTheme } from "@mui/material";
import type { ReactElement } from "react";
import { memo, useCallback, useMemo, useState } from "react";

import type { EntityEditorProps } from "./entity/entity-editor";
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
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeIds"> &
    Partial<Pick<EntityMetadata, "temporalVersioning">>;
  properties: PropertyObject;
};

const fallbackDefaultConfig = {
  graphKey: "entity-graph-2024-11-19b",
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
    closedMultiEntityTypesRootMap,
    defaultConfig: defaultConfigFromProps,
    defaultFilters,
    entities,
    fullScreenMode,
    isPrimaryEntity,
    loadingComponent,
    onEntityClick,
    onEntityTypeClick,
  }: {
    closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
    defaultConfig?: GraphVizConfig<DynamicNodeSizing>;
    defaultFilters?: GraphVizFilters;
    fullScreenMode?: "document" | "element";
    entities?: T[];
    onEntityClick?: (
      entityId: EntityId,
      options?: Pick<EntityEditorProps, "defaultOutgoingLinkFilters">,
    ) => void;
    onEntityTypeClick?: (entityTypeId: VersionedUrl) => void;
    /**
     * Whether this entity should receive a special highlight.
     */
    isPrimaryEntity?: (entity: T) => boolean;
    loadingComponent: ReactElement;
  }) => {
    const { palette } = useTheme();

    const [loading, setLoading] = useState(true);

    const nodeColors = useMemo(() => {
      return ibm.map((color) => ({ color, borderColor: palette.gray[50] }));
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

      const closedMultiEntityTypesById: Record<string, ClosedMultiEntityType> =
        {};

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

        const sortedEntityTypeIds = mustHaveAtLeastOne(
          entity.metadata.entityTypeIds.toSorted(),
        );

        const firstEntityTypeId = sortedEntityTypeIds[0];

        /**
         * @todo H-3539: take account of additional types an entity might have
         */
        if (!entityTypeIdToColor.has(firstEntityTypeId)) {
          entityTypeIdToColor.set(
            firstEntityTypeId,
            entityTypeIdToColor.size % nodeColors.length,
          );
        }

        const { color, borderColor } = specialHighlight
          ? { color: palette.blue[50], borderColor: palette.blue[60] }
          : nodeColors[entityTypeIdToColor.get(firstEntityTypeId)!]!;

        const combinedKey = sortedEntityTypeIds.join(",");

        const entityType =
          closedMultiEntityTypesById[combinedKey] ??
          getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypesRootMap,
            entity.metadata.entityTypeIds,
          );

        const displayFields = getDisplayFieldsForClosedEntityType(entityType);
        const icon = displayFields.icon;

        const nodeTypeLabel = entityType.allOf[0].title;
        const entityLabel = generateEntityLabel(entityType, entity);

        closedMultiEntityTypesById[combinedKey] = entityType!;

        nodesToAddByNodeId[entity.metadata.recordId.entityId] = {
          icon,
          label: entityLabel,
          nodeId: entity.metadata.recordId.entityId,
          nodeTypeId: firstEntityTypeId,
          nodeTypeLabel,
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
          edgeTypeId: linkEntity.metadata.entityTypeIds[0],
          size: 1,
        });
      }

      return {
        nodes: Object.values(nodesToAddByNodeId),
        edges: edgesToAdd,
      };
    }, [
      closedMultiEntityTypesRootMap,
      defaultConfig.nodeSizing.min,
      entities,
      isPrimaryEntity,
      nodeColors,
      palette.blue,
    ]);

    const onNodeClick = useCallback<
      NonNullable<GraphVisualizerProps<DynamicNodeSizing>["onNodeSecondClick"]>
    >(
      ({ nodeId }) => {
        if (isEntityId(nodeId)) {
          onEntityClick?.(nodeId);
        } else {
          onEntityTypeClick?.(nodeId as VersionedUrl);
        }
      },
      [onEntityClick, onEntityTypeClick],
    );

    const onEdgeClick = useCallback<
      NonNullable<GraphVisualizerProps<DynamicNodeSizing>["onEdgeClick"]>
    >(
      ({ edgeData }) => {
        onEntityClick?.(edgeData.source as EntityId, {
          defaultOutgoingLinkFilters: {
            linkedTo: new Set([edgeData.target]),
            linkTypes: new Set([edgeData.edgeTypeId!]),
          },
        });
      },
      [onEntityClick],
    );

    const onRender = useCallback(() => setLoading(false), []);

    return (
      <Box sx={{ height: "100%" }}>
        {loading && (
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
