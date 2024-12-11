import type {
  Entity,
  EntityRootType,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import { extractBaseUrl } from "@blockprotocol/graph";
import {
  getIncomingLinksForEntity,
  getOutgoingLinksForEntity,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import type { ECOption } from "@hashintel/design-system";
import { EChart } from "@hashintel/design-system";
import type { FunctionComponent } from "react";
import { useMemo } from "react";

import type { ChartDefinition } from "./types/chart-definition";

export const BarChart: FunctionComponent<{
  definition: ChartDefinition<"bar-chart">;
  queryResult: Subgraph<EntityRootType>;
}> = ({ definition, queryResult }) => {
  const queryResultsByType = useMemo(
    () =>
      getRoots(queryResult).reduce<Record<VersionedUrl, Entity[]>>(
        (prev, currentEntity) => ({
          ...prev,
          [currentEntity.metadata.entityTypeId]: [
            ...(prev[currentEntity.metadata.entityTypeId] ?? []),
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
        (prev, entity) => ({
          ...prev,
          [entity.properties[
            extractBaseUrl(definition.groupByPropertyTypeId)
          ] as string]: [
            ...(prev[
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
    } else {
      const { entityTypeId, labelPropertyTypeId, direction, linkEntityTypeId } =
        definition;

      const dataPoints = queryResultsByType[entityTypeId]
        ?.reduce<{ label: string; value: number }[]>((prev, entity) => {
          const entityId = entity.metadata.recordId.entityId;

          const links =
            direction === "outgoing"
              ? getOutgoingLinksForEntity(queryResult, entityId)
              : getIncomingLinksForEntity(queryResult, entityId);

          const matchingLinks = links.filter(
            ({ metadata }) => metadata.entityTypeId === linkEntityTypeId,
          );

          const label = String(
            // @todo: https://linear.app/hash/issue/H-3769/investigate-new-eslint-errors
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            entity.properties[extractBaseUrl(labelPropertyTypeId)] ?? "Unknown",
          );

          return [...prev, { label, value: matchingLinks.length }];
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
    }
  }, [queryResult, queryResultsByType, definition]);

  return <EChart options={eChartOptions} />;
};
