import {
  Entity,
  EntityId,
  EntityRootType,
  Subgraph,
} from "@blockprotocol/graph";
import { getEntities, getEntityTypeById } from "@blockprotocol/graph/stdlib";
import { Chart, EChart, ECOption } from "@hashintel/design-system";
// eslint-disable-next-line no-restricted-imports
import { generateEntityLabel as hashGenerateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { BoxProps, useTheme } from "@mui/material";
import { FunctionComponent, useEffect, useMemo, useState } from "react";

const generateEntityLabel = (
  subgraph: Subgraph<EntityRootType>,
  entity: Entity,
) => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return hashGenerateEntityLabel(subgraph as any, entity as any);
};

export const EntitiesGraphChart: FunctionComponent<{
  filterEntity?: (entity: Entity) => boolean;
  onEntityClick?: (entity: Entity) => void;
  isPrimaryEntity?: (entity: Entity) => boolean;
  subgraph?: Subgraph<EntityRootType>;
  sx?: BoxProps["sx"];
}> = ({ filterEntity, isPrimaryEntity, subgraph, sx, onEntityClick }) => {
  const [chart, setChart] = useState<Chart>();

  const entities = useMemo(
    () => (subgraph ? getEntities(subgraph) : undefined),
    [subgraph],
  );

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
            ): entity is Entity & {
              linkData: NonNullable<Entity["linkData"]>;
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
          params.componentType === "series" &&
          params.seriesType === "graph"
        ) {
          if (params.dataType === "node" || params.dataType === "edge") {
            /** @todo: improve typing */
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            const entityId = (params.data as any).id as EntityId;

            const entity = entities?.find(
              ({ metadata }) => entityId === metadata.recordId.entityId,
            );

            if (entity) {
              onEntityClick?.(entity);
            }
          }
        }
      });
    }
    return () => {
      chart?.off("click");
    };
  }, [chart, entities, onEntityClick]);

  const chartInitialized = !!chart;

  const theme = useTheme();

  const eChartOptions = useMemo<ECOption>(() => {
    return {
      tooltip: {
        borderColor: theme.palette.blue[70],
        show: true,
        trigger: "item",
        formatter: (params) => {
          /** @todo: improve typing */
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const id = (params as any).data.id as string;

          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if ((params as any).dataType === "edge") {
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
                subgraph!,
                linkEntity.metadata.entityTypeId,
              )?.schema.title;

              return [
                `<strong>${generateEntityLabel(
                  subgraph!,
                  leftEntity!,
                )}</strong>`,
                linkEntityTypeTitle?.toLowerCase(),
                `<strong>${generateEntityLabel(
                  subgraph!,
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
                subgraph!,
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
        draggable: true,
        force: {
          layoutAnimation: chartInitialized,
        },
        data: nonLinkEntities?.map((entity) => ({
          name: generateEntityLabel(subgraph!, entity),
          id: entity.metadata.recordId.entityId,
          label: {
            show: true,
            textBorderColor: theme.palette.blue[90],
            textBorderWidth: 2,
          },
          itemStyle: {
            color: theme.palette.blue[70],
            ...(isPrimaryEntity
              ? {
                  opacity: isPrimaryEntity(entity) ? 1 : 0.6,
                }
              : {}),
          },
        })),
        edges: linkEntities?.map((linkEntity) => ({
          /** @todo: figure out why the right entity is the source and not the target */
          source: linkEntity.linkData.leftEntityId,
          target: linkEntity.linkData.rightEntityId,
          id: linkEntity.metadata.recordId.entityId,
          label: {
            show: true,
            formatter: () =>
              getEntityTypeById(subgraph!, linkEntity.metadata.entityTypeId)
                ?.schema.title ?? "Unknown",
          },
          symbol: ["none", "arrow"],
          name: linkEntity.metadata.entityTypeId,
        })),
        type: "graph",
        layout: "force",
        // Hack for only setting the zoom if the chart hasn't already been initialized
        ...(chartInitialized ? {} : { zoom: 5 }),
      },
    };
  }, [
    subgraph,
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
