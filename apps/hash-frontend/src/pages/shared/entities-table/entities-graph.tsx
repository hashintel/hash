import { BaseUrl } from "@blockprotocol/type-system";
import { EChart, ECOption } from "@hashintel/design-system";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getEntities, getEntityTypeById } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";
import { FunctionComponent, useMemo } from "react";

import { generateEntityLabel } from "../../../lib/entities";

export const EntitiesGraph: FunctionComponent<{
  primaryEntityTypeBaseUrl?: BaseUrl;
  subgraph?: Subgraph<EntityRootType>;
}> = ({ primaryEntityTypeBaseUrl, subgraph }) => {
  const eChartOptions = useMemo<ECOption>(() => {
    const entities = subgraph ? getEntities(subgraph, true) : undefined;

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

              const leftEntityTypeTitle = getEntityTypeById(
                subgraph!,
                leftEntity!.metadata.entityTypeId,
              )?.schema.title;

              const rightEntity = entities?.find(
                ({ metadata }) =>
                  metadata.recordId.entityId ===
                  linkEntity.linkData.rightEntityId,
              );

              const rightEntityTypeTitle = getEntityTypeById(
                subgraph!,
                rightEntity!.metadata.entityTypeId,
              )?.schema.title;

              const linkEntityTypeTitle = getEntityTypeById(
                subgraph!,
                linkEntity.metadata.entityTypeId,
              )?.schema.title;

              return [
                leftEntityTypeTitle,
                `<strong>${generateEntityLabel(
                  subgraph!,
                  leftEntity,
                )}</strong>`,
                linkEntityTypeTitle?.toLowerCase(),
                rightEntityTypeTitle,
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

              return entityType?.schema.title;
            }
          }
        },
      },
      series: {
        roam: true,
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
  }, [subgraph, primaryEntityTypeBaseUrl]);

  return (
    <EChart
      sx={{
        background: ({ palette }) => palette.common.white,
      }}
      options={eChartOptions}
    />
  );
};
