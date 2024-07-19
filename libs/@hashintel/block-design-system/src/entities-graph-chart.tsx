import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import type {
  Chart,
  ECOption,
  GraphEdge,
  GraphNode,
} from "@hashintel/design-system";
import { EChart } from "@hashintel/design-system";
/* eslint-disable no-restricted-imports */
import type {
  EntityId,
  EntityMetadata,
  LinkData,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import { generateEntityLabel as hashGenerateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { Subgraph } from "@local/hash-subgraph";
import { isEntityId } from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/stdlib";
/* eslint-enable no-restricted-imports */
import type { BoxProps } from "@mui/material";
import { useTheme } from "@mui/material";
import { useEffect, useMemo, useState } from "react";

export type EntityForGraphChart = {
  linkData?: LinkData;
  metadata: Pick<EntityMetadata, "recordId" | "entityTypeId"> &
    Partial<Pick<EntityMetadata, "temporalVersioning">>;
  properties: PropertyObject;
};

const generateEntityLabel = (
  subgraph: Subgraph,
  entity: EntityForGraphChart,
) => {
  return hashGenerateEntityLabel(subgraph, entity);
};

const nodeCategories = [{ name: "entity" }, { name: "entityType" }];

export const EntitiesGraphChart = <T extends EntityForGraphChart>({
  entities,
  filterEntity,
  isPrimaryEntity,
  subgraphWithTypes,
  sx,
  onEntityClick,
  onEntityTypeClick,
}: {
  entities?: T[];
  filterEntity?: (entity: T) => boolean;
  onEntityClick?: (entityId: EntityId) => void;
  onEntityTypeClick?: (entityTypeId: VersionedUrl) => void;
  isPrimaryEntity?: (entity: T) => boolean;
  subgraphWithTypes: Subgraph;
  sx?: BoxProps["sx"];
}) => {
  const [chart, setChart] = useState<Chart>();

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

  useEffect(() => {
    if (chart) {
      chart.on("click", (params) => {
        if (
          (params.dataType === "node" &&
            (params.data as GraphNode).category === "entity") ||
          (params.dataType === "edge" &&
            isEntityId((params.data as GraphEdge).target as string))
        ) {
          const entityId = (params.data as GraphNode | GraphEdge)
            .id as EntityId;

          onEntityClick?.(entityId);
        } else if (
          params.dataType === "node" &&
          (params.data as GraphNode).category === "entityType"
        ) {
          const entityTypeId = (params.data as GraphNode).id as VersionedUrl;

          onEntityTypeClick?.(entityTypeId);
        }
      });
    }
    return () => {
      chart?.off("click");
    };
  }, [chart, entities, onEntityClick, onEntityTypeClick]);

  const chartInitialized = !!chart;

  const theme = useTheme();

  const eChartOptions = useMemo<ECOption>(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const typesAlreadyAdded: Set<VersionedUrl> = new Set();

    const nodeLabelStyle = {
      backgroundColor: "rgba(255, 255, 255, 0.4)",
      fontFamily: theme.typography.fontFamily,
      fontSize: 14,
      fontWeight: 600,
      position: "bottom",
      padding: 4,
      distance: 1,
      show: true,
    } as const;

    for (const entity of nonLinkEntities ?? []) {
      nodes.push({
        category: "entity",
        name: generateEntityLabel(subgraphWithTypes, entity),
        id: entity.metadata.recordId.entityId,
        label: nodeLabelStyle,
        itemStyle: {
          color: theme.palette.blue[20],
          borderColor: theme.palette.blue[30],
          ...(isPrimaryEntity
            ? {
                opacity: isPrimaryEntity(entity) ? 1 : 0.6,
              }
            : {}),
        },
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

          nodes.push({
            category: "entityType",
            name: title,
            id: $id,
            label: {
              ...nodeLabelStyle,
            },
            itemStyle: {
              color: theme.palette.blue[70],
            },
          });
        }

        edges.push({
          source: entity.metadata.recordId.entityId,
          target: $id,
          name: `${entity.metadata.recordId.entityId}-${$id}`,
          label: {
            fontSize: 12,
            padding: 2,
            show: true,
            formatter: () => "is of type",
          },
          symbol: ["none", "arrow"],
          symbolSize: 8,
        });
      }
    }

    for (const linkEntity of linkEntities ?? []) {
      const linkEntityType = getEntityTypeById(
        subgraphWithTypes,
        linkEntity.metadata.entityTypeId,
      );

      edges.push({
        /** @todo: figure out why the right entity is the source and not the target */
        source: linkEntity.linkData.leftEntityId,
        target: linkEntity.linkData.rightEntityId,
        id: linkEntity.metadata.recordId.entityId,
        name: linkEntity.metadata.recordId.entityId,
        label: {
          show: true,
          formatter: () => linkEntityType?.schema.title ?? "Unknown",
        },
        symbol: ["none", "arrow"],
        symbolSize: 8,
      });
    }

    return {
      categories: nodeCategories,
      tooltip: {
        show: true,
        trigger: "item",
        formatter: (untypedParams) => {
          const params = untypedParams as {
            data: GraphNode | GraphEdge;
            dataType: "node" | "edge";
          };

          const id = params.data.id;

          if (params.dataType === "edge") {
            const linkEntity = linkEntities?.find(
              ({ metadata }) => metadata.recordId.entityId === id,
            );

            if (linkEntity) {
              const leftEntity = entities?.find(
                ({ metadata }) =>
                  metadata.recordId.entityId ===
                  linkEntity.linkData.leftEntityId,
              );

              const rightEntity = entities?.find(
                ({ metadata }) =>
                  metadata.recordId.entityId ===
                  linkEntity.linkData.rightEntityId,
              );

              const linkEntityTypeTitle = getEntityTypeById(
                subgraphWithTypes,
                linkEntity.metadata.entityTypeId,
              )?.schema.title;

              return [
                `<strong>${generateEntityLabel(
                  subgraphWithTypes,
                  leftEntity!,
                )}</strong>`,
                linkEntityTypeTitle?.toLowerCase(),
                `<strong>${generateEntityLabel(
                  subgraphWithTypes,
                  rightEntity!,
                )}</strong>`,
              ].join(" ");
            }
          } else {
            const entity = entities?.find(
              ({ metadata }) => metadata.recordId.entityId === id,
            );

            if (entity) {
              const entityType = getEntityTypeById(
                subgraphWithTypes,
                entity.metadata.entityTypeId,
              );

              return entityType?.schema.title ?? "";
            }
          }

          return "";
        },
      },
      series: {
        roam: true,
        draggable: false,
        force: {
          layoutAnimation: chartInitialized,
        },
        scaleLimit: {
          min: 4,
          max: 12,
        },
        nodes,
        edges,
        type: "graph",
        layout: "force",
        // Hack for only setting the zoom if the chart hasn't already been initialized
        ...(chartInitialized ? {} : { zoom: 5 }),
      },
    };
  }, [
    subgraphWithTypes,
    entities,
    linkEntities,
    nonLinkEntities,
    isPrimaryEntity,
    theme,
    chartInitialized,
  ]);

  return (
    <EChart
      sx={sx}
      onChartInitialized={(initializedChart) => {
        setChart(initializedChart);
      }}
      options={eChartOptions}
    />
  );
};
