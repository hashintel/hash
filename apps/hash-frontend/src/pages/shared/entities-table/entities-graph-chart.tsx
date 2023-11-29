import { BaseUrl } from "@blockprotocol/type-system";
import { Chart, EChart, ECOption } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  Entity,
  EntityId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntities, getEntityTypeById } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import { BoxProps } from "@mui/material";
import { FunctionComponent, useEffect, useMemo, useRef, useState } from "react";

export const EntitiesGraphChart: FunctionComponent<{
  filterEntity?: (entity: Entity) => boolean;
  onEntityClick?: (entity: Entity) => void;
  primaryEntityTypeBaseUrl?: BaseUrl;
  subgraph?: Subgraph<EntityRootType>;
  sx?: BoxProps["sx"];
}> = ({
  filterEntity,
  primaryEntityTypeBaseUrl,
  subgraph,
  sx,
  onEntityClick,
}) => {
  const [chart, setChart] = useState<Chart>();

  const entities = useMemo(
    () => (subgraph ? getEntities(subgraph, true) : undefined),
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
            (entity): entity is LinkEntity =>
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

  const chartInitialized = useRef(false);

  const eChartOptions = useMemo<ECOption>(() => {
    return {
      tooltip: {
        show: true,
        trigger: "item",
        formatter: (params) => {
          const id = (params as any).data.id as string;

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
                  leftEntity,
                )}</strong>`,
                linkEntityTypeTitle?.toLowerCase(),
                `<strong>${generateEntityLabel(
                  subgraph!,
                  rightEntity,
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
        data: nonLinkEntities?.map((entity) => ({
          name: generateEntityLabel(subgraph!, entity),
          id: entity.metadata.recordId.entityId,
          label: {
            show: true,
          },
          itemStyle: primaryEntityTypeBaseUrl
            ? {
                opacity:
                  extractBaseUrl(entity.metadata.entityTypeId) ===
                  primaryEntityTypeBaseUrl
                    ? 1
                    : 0.8,
              }
            : undefined,
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
        ...(chartInitialized.current ? {} : { zoom: 5 }),
      },
    };
  }, [
    subgraph,
    entities,
    linkEntities,
    nonLinkEntities,
    primaryEntityTypeBaseUrl,
  ]);

  return (
    <EChart
      sx={sx}
      onChartInitialized={(initializedChart) => {
        setChart(initializedChart);
        chartInitialized.current = true;
      }}
      options={eChartOptions}
    />
  );
};
