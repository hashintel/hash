import * as React from "react";
import { BlockProtocolEntityType } from "blockprotocol";

import { BlockComponent } from "blockprotocol/react";
import { Graph, SeriesDefinition, SeriesType } from "./graph";

const generateUniqueSeriesId = (params: {
  seriesDefinitions: SeriesDefinition[];
  potentialSeriesIdIndex?: number;
}): string => {
  const { seriesDefinitions } = params;
  const potentialSeriesIdIndex = params.potentialSeriesIdIndex ?? 1;
  const potentialSeriesId = `series${potentialSeriesIdIndex}`;
  if (
    params.seriesDefinitions.find(
      ({ seriesId }) => seriesId === potentialSeriesId,
    )
  ) {
    return generateUniqueSeriesId({
      seriesDefinitions,
      potentialSeriesIdIndex: potentialSeriesIdIndex + 1,
    });
  }
  return potentialSeriesId;
};

type GraphEntityProperties = {
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  series?: {
    seriesId: string;
    seriesName: string;
    seriesType: SeriesType;
    xAxisPropertyKey: string;
    yAxisPropertyKey: string;
  }[];
};

type AppProps = GraphEntityProperties;

export const App: BlockComponent<AppProps> = ({
  entityId,
  accountId,
  aggregateEntityTypes,
  updateEntities,
  title = "Graph Title",
  xAxisLabel = "X Axis",
  yAxisLabel = "Y Axis",
  series = [],
  linkedAggregations,
  createLinkedAggregations,
  updateLinkedAggregations,
}) => {
  if (!linkedAggregations) {
    throw new Error("linkedAggregations is required to render the Graph block");
  }

  const [possibleEntityTypes, setPossibleEntityTypes] = React.useState<
    BlockProtocolEntityType[]
  >([]);

  React.useEffect(() => {
    if (!aggregateEntityTypes) {
      throw new Error(
        "aggregateEntityTypes is required to render the Graph block",
      );
    }
    void aggregateEntityTypes({ accountId }).then(({ results }) =>
      setPossibleEntityTypes(results),
    );
  }, [aggregateEntityTypes, accountId]);

  const updateGraphEntityProperties = React.useCallback(
    async (updatedProperties: Partial<GraphEntityProperties>) => {
      if (!updateEntities) {
        throw new Error("updateEntities is required to render the Graph block");
      }
      if (!entityId) {
        throw new Error("entityId is required to render the Graph block");
      }

      await updateEntities([{ accountId, entityId, data: updatedProperties }]);
    },
    [updateEntities, entityId, accountId],
  );

  const seriesDefinitions = React.useMemo<SeriesDefinition[]>(
    () =>
      series.map(({ seriesId, ...definition }) => {
        const aggregation = linkedAggregations.find(
          ({ path }) => path === `$.${seriesId}`,
        );

        if (!aggregation) {
          throw new Error(`cannot find aggregation with path '$.${seriesId}'`);
        }

        if (!aggregation.operation.entityTypeId) {
          throw new Error(
            "entityTypeId is not defined on aggregation operation",
          );
        }

        return {
          seriesId,
          ...definition,
          entityTypeId: aggregation.operation.entityTypeId,
          aggregationResults: aggregation.results,
        };
      }),
    [series, linkedAggregations],
  );

  const handleUpdateSeriesDefinition = React.useCallback(
    async (params: {
      seriesId: string;
      updatedDefinition: Partial<Omit<SeriesDefinition, "seriesId">>;
    }): Promise<void> => {
      if (!updateLinkedAggregations) {
        throw new Error(
          "updateLinkedAggregations is required to update a series definition",
        );
      }

      const seriesIndex = series.findIndex(
        ({ seriesId }) => seriesId === params.seriesId,
      );

      const previousSeries = series[seriesIndex];

      if (!previousSeries) {
        throw new Error(
          `Could not find series with seriesId ${params.seriesId}`,
        );
      }

      const previousAggregation = linkedAggregations.find(
        ({ path }) => path === `$.${params.seriesId}`,
      );

      if (!previousAggregation || !previousAggregation.operation.entityTypeId) {
        throw new Error(
          `Could not find linked aggregation with path that contains seriesId ${params.seriesId}`,
        );
      }

      if (
        params.updatedDefinition.entityTypeId &&
        params.updatedDefinition.entityTypeId !==
          previousAggregation.operation.entityTypeId
      ) {
        await updateLinkedAggregations([
          {
            sourceAccountId: previousAggregation.sourceAccountId,
            aggregationId: previousAggregation.aggregationId,
            data: {
              entityTypeId: params.updatedDefinition.entityTypeId,
            },
          },
        ]);
      }

      if (
        params.updatedDefinition.seriesType ||
        params.updatedDefinition.xAxisPropertyKey ||
        params.updatedDefinition.yAxisPropertyKey
        /** @todo: check these values actually changed */
      ) {
        await updateGraphEntityProperties({
          series: [
            ...series.slice(0, seriesIndex),
            {
              ...previousSeries,
              seriesType:
                params.updatedDefinition.seriesType ??
                previousSeries.seriesType,
              xAxisPropertyKey:
                params.updatedDefinition.xAxisPropertyKey ??
                previousSeries.xAxisPropertyKey,
              yAxisPropertyKey:
                params.updatedDefinition.yAxisPropertyKey ??
                previousSeries.yAxisPropertyKey,
            },
            ...series.slice(seriesIndex + 1),
          ],
        });
      }
    },
    [
      series,
      linkedAggregations,
      updateGraphEntityProperties,
      updateLinkedAggregations,
    ],
  );

  const handleCreateSeriesDefinition = React.useCallback(
    async (params: {
      definition: Omit<SeriesDefinition, "seriesId" | "aggregationResults">;
    }): Promise<void> => {
      if (!createLinkedAggregations) {
        throw new Error(
          "createLinkedAggregations is requried to create a series definition",
        );
      }
      const { definition } = params;

      const seriesId = generateUniqueSeriesId({ seriesDefinitions });

      const { seriesType, xAxisPropertyKey, yAxisPropertyKey } = definition;

      await updateGraphEntityProperties({
        series: [
          ...series,
          {
            seriesId,
            seriesName: `Series ${seriesId}`,
            seriesType,
            xAxisPropertyKey,
            yAxisPropertyKey,
          },
        ],
      });

      await createLinkedAggregations([
        {
          sourceEntityId: entityId,
          sourceAccountId: accountId,
          path: `$.${seriesId}`,
          operation: {
            entityTypeId: definition.entityTypeId,
          },
        },
      ]);
    },
    [
      series,
      updateGraphEntityProperties,
      createLinkedAggregations,
      seriesDefinitions,
      accountId,
      entityId,
    ],
  );

  return (
    <Graph
      title={title}
      updateTitle={(updatedTitle) =>
        updateGraphEntityProperties({ title: updatedTitle })
      }
      yAxisName={xAxisLabel}
      xAxisName={yAxisLabel}
      possibleEntityTypes={possibleEntityTypes}
      seriesDefinitions={seriesDefinitions}
      updateSeriesDefinition={handleUpdateSeriesDefinition}
      createSeriesDefinition={handleCreateSeriesDefinition}
    />
  );
};
