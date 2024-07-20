import type { FunctionComponent, useMemo } from "react";
import type {
  Entity,
  EntityRootType,
  extractBaseUrl,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import {
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { EChart, ECOption } from "@hashintel/design-system";

import type { ChartDefinition } from "./types/chart-definition";

export const BarChart: FunctionComponent<{
  definition: ChartDefinition<"bar-chart">;
  queryResult: Subgraph<EntityRootType>;
}> = ({ definition, queryResult }) => {
  const queryResultsByType = useMemo(
    () =>
      getRoots(queryResult).reduce<Record<VersionedUrl, Entity[]>>(
        (previous, currentEntity) => ({
          ...previous,
          [currentEntity.metadata.entityTypeId]: [
            ...(previous[currentEntity.metadata.entityTypeId] ?? []),
            currentEntity,
          ],
        }),
        {},
      ),
    [queryResult],
  );

  const eChartOptions = useMemo<ECOption>(() => {
    if (definition.variant === "group-by-property") {
      const entitiesByProperty = queryResultsByType[
        definition.entityTypeId
      ]?.reduce<Record<string, Entity[]>>(
        (previous, entity) => ({
          ...previous,
          [entity.properties[
            extractBaseUrl(definition.groupByPropertyTypeId)
          ] as string]: [
            ...(previous[
              entity.properties[
                extractBaseUrl(definition.groupByPropertyTypeId)
              ] as string
            ] ?? []),
            entity,
          ],
        }),
        {},
      );

      const dataPoints = Object.entries(entitiesByProperty ?? {})
        .map(([property, entities]) => ({
          label: property,
          value: entities.length,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));

      return {
        xAxis: {
          type: "category",
          data: dataPoints.map(({ label }) => label),
          name: definition.xAxisLabel,
          nameLocation: "middle",
          nameGap: 25,
        },
        yAxis: {
          type: "value",
          name: definition.yAxisLabel,
          nameLocation: "middle",
          nameGap: 25,
        },
        series: {
          data: dataPoints.map(({ value }) => value),
          type: "bar",
        },
      };
    }
    const { entityTypeId, labelPropertyTypeId, direction, linkEntityTypeId } =
      definition;

    const dataPoints = queryResultsByType[entityTypeId]
      ?.reduce<{ label: string; value: number }[]>((previous, entity) => {
        const { entityId } = entity.metadata.recordId;

        const links =
          direction === "outgoing"
            ? getOutgoingLinksForEntity(queryResult, entityId)
            : getIncomingLinksForEntity(queryResult, entityId);

        const matchingLinks = links.filter(
          ({ metadata }) => metadata.entityTypeId === linkEntityTypeId,
        );

        const label = String(
          entity.properties[extractBaseUrl(labelPropertyTypeId)] ?? "Unknown",
        );

        return [...previous, { label, value: matchingLinks.length }];
      }, [])
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      xAxis: {
        type: "category",
        data: dataPoints?.map(({ label }) => label) ?? [],
        name: definition.xAxisLabel,
        nameLocation: "middle",
        nameGap: 25,
      },
      yAxis: {
        type: "value",
        name: definition.yAxisLabel,
        nameLocation: "middle",
        nameGap: 25,
      },
      series: {
        data: dataPoints?.map(({ value }) => value) ?? [],
        type: "bar",
      },
    };
  }, [queryResult, queryResultsByType, definition]);

  return <EChart options={eChartOptions} />;
};
