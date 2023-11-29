import { BaseUrl } from "@blockprotocol/type-system";
import { Chart, EChart, ECOption } from "@hashintel/design-system";
import {
  EntityId,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getEntities, getEntityTypeById } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import { BoxProps } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent, useEffect, useMemo, useState } from "react";

import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import { generateEntityLabel } from "../../../lib/entities";

export const EntitiesGraph: FunctionComponent<{
  primaryEntityTypeBaseUrl?: BaseUrl;
  subgraph?: Subgraph<EntityRootType>;
  sx?: BoxProps["sx"];
}> = ({ primaryEntityTypeBaseUrl, subgraph, sx }) => {
  const router = useRouter();
  const [chart, setChart] = useState<Chart>();

  const entities = useMemo(
    () => (subgraph ? getEntities(subgraph, true) : undefined),
    [subgraph],
  );

  const getOwnerForEntity = useGetOwnerForEntity();

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

            if (!entity) {
              return;
            }

            const { shortname: entityNamespace } = getOwnerForEntity(entity);

            if (entityNamespace === "") {
              return;
            }

            void router.push(
              `/@${entityNamespace}/entities/${extractEntityUuidFromEntityId(
                entityId,
              )}`,
            );
          }
        }
      });
    }
    return () => {
      chart?.off("click");
    };
  }, [chart, entities, router, getOwnerForEntity]);

  const eChartOptions = useMemo<ECOption>(() => {
    const linkEntities = entities?.filter(
      (entity): entity is LinkEntity => "linkData" in entity,
    );

    const nonLinkEntities = entities?.filter((entity) => !entity.linkData);

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
        zoom: 5,
      },
    };
  }, [subgraph, entities, primaryEntityTypeBaseUrl]);

  return (
    <EChart
      sx={sx}
      onChartInitialized={(initializedChart) => setChart(initializedChart)}
      options={eChartOptions}
    />
  );
};
