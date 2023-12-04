import {
  Entity,
  EntityRootType,
  extractBaseUrl,
  Subgraph,
  VersionedUrl,
} from "@blockprotocol/graph";
import {
  getIncomingLinksForEntity,
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { EChart, ECOption } from "@hashintel/design-system";
import { FunctionComponent, useMemo } from "react";

import { ChartDefinition } from "./types/chart-definition";

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

      return {
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
          data: Object.values(entitiesByProperty ?? {}).map(
            (entityGroup) => entityGroup.length,
          ),
          type: "bar",
        },
      };
    } else {
      const { entityTypeId, labelPropertyTypeId, direction, linkEntityTypeId } =
        definition;

      const dataPoints = queryResultsByType[entityTypeId]?.reduce<
        { label: string; value: number }[]
      >((prev, entity) => {
        const entityId = entity.metadata.recordId.entityId;

        const links =
          direction === "outgoing"
            ? /** @todo: fix `getIncomingLinksForEntity` in the BP temporal package when passing non-temporal subgraphs */
              getOutgoingLinkAndTargetEntities(queryResult, entityId).map(
                ({ linkEntity }) => linkEntity,
              )
            : getIncomingLinksForEntity(queryResult, entityId);

        const matchingLinks = links.filter(
          ({ metadata }) => metadata.entityTypeId === linkEntityTypeId,
        );

        const label = String(
          entity.properties[extractBaseUrl(labelPropertyTypeId)] ?? "Unknown",
        );

        return [...prev, { label, value: matchingLinks.length }];
      }, []);

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
