import {
  Entity,
  EntityId,
  EntityRootType,
  extractBaseUrl,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph/temporal";
import { getRoots } from "@blockprotocol/graph/temporal/stdlib";
import { EChart, ECOption } from "@hashintel/design-system";
import { FunctionComponent, useMemo } from "react";

import { ChartDefinition } from "./types/chart-definition";

export const BarChart: FunctionComponent<{
  definition: ChartDefinition<"bar-chart">;
  queryResults: Record<EntityId, Subgraph<EntityRootType>>;
}> = ({ definition, queryResults }) => {
  const allQueryResultsByType = useMemo(
    () =>
      Object.values(queryResults)
        .map((subgraph) => getRoots(subgraph))
        .flat()
        .reduce<Record<VersionedUrl, Entity[]>>(
          (prev, currentEntity) => ({
            ...prev,
            [currentEntity.metadata.entityTypeId]: [
              ...(prev[currentEntity.metadata.entityTypeId] ?? []),
              currentEntity,
            ],
          }),
          {},
        ),
    [queryResults],
  );

  const entitiesByProperty = useMemo(
    () =>
      allQueryResultsByType[definition.entityTypeId]?.reduce<
        Record<string, Entity[]>
      >(
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
      ),
    [allQueryResultsByType, definition],
  );

  const eChartOptions = useMemo<ECOption>(
    () => ({
      xAxis: {
        type: "category",
        data: Object.keys(entitiesByProperty ?? []),
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
        data: Object.values(entitiesByProperty ?? []).map(
          (entityGroup) => entityGroup.length,
        ),
        type: "bar",
      },
    }),
    [entitiesByProperty, definition],
  );

  return <EChart options={eChartOptions} />;
};
