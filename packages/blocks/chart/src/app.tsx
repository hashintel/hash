import * as React from "react";
import { BlockProtocolEntityType } from "blockprotocol";

import { BlockComponent } from "blockprotocol/react";
import {
  Chart,
  ChartConfigProperties,
  SeriesDefinition,
  SeriesType,
} from "./chart";

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

type ChartEntityConfigProperties = Partial<ChartConfigProperties>;

type ChartEntityProperties = {
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
} & ChartEntityConfigProperties;

type BlockEntityProperties = ChartEntityProperties;

export const App: BlockComponent<BlockEntityProperties> = ({
  entityId,
  accountId,
  aggregateEntityTypes,
  updateEntities,
  createLinkedAggregations,
  updateLinkedAggregations,
  deleteLinkedAggregations,
  linkedAggregations,
  title = "Chart Title",
  xAxisLabel = "X Axis Label",
  yAxisLabel = "Y Axis Label",
  series = [],
  displayDataPointLabels = false,
  displayLegend = false,
}) => {
  if (!linkedAggregations) {
    throw new Error("linkedAggregations is required to render the Chart block");
  }

  const currentConfigProperties = React.useMemo<ChartConfigProperties>(
    () => ({
      displayDataPointLabels,
      displayLegend,
    }),
    [displayDataPointLabels, displayLegend],
  );

  const currentProperties = React.useMemo<ChartEntityProperties>(
    () => ({
      title,
      xAxisLabel,
      yAxisLabel,
      series,
      ...currentConfigProperties,
    }),
    [title, xAxisLabel, yAxisLabel, series, currentConfigProperties],
  );

  const [possibleEntityTypes, setPossibleEntityTypes] = React.useState<
    BlockProtocolEntityType[]
  >([]);

  React.useEffect(() => {
    if (!aggregateEntityTypes) {
      throw new Error(
        "aggregateEntityTypes is required to render the Chart block",
      );
    }
    void aggregateEntityTypes({ accountId }).then(({ results }) =>
      setPossibleEntityTypes(results),
    );
  }, [aggregateEntityTypes, accountId]);

  const updateChartEntityProperties = React.useCallback(
    async (updatedProperties: Partial<ChartEntityProperties>) => {
      if (!updateEntities) {
        throw new Error("updateEntities is required to render the Chart block");
      }
      if (!entityId) {
        throw new Error("entityId is required to render the Chart block");
      }

      await updateEntities([
        {
          accountId,
          entityId,
          data: {
            ...currentProperties,
            ...updatedProperties,
          },
        },
      ]);
    },
    [updateEntities, entityId, accountId, currentProperties],
  );

  const seriesDefinitions = React.useMemo<SeriesDefinition[]>(
    () =>
      series
        .map(({ seriesId, ...definition }) => {
          const aggregation = linkedAggregations.find(
            ({ path }) => path === `$.${seriesId}`,
          );

          if (!aggregation) {
            return [];
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
        })
        .flat(),
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
            operation: {
              entityTypeId: params.updatedDefinition.entityTypeId,
            },
          },
        ]);
      }

      if (
        params.updatedDefinition.seriesType ||
        params.updatedDefinition.xAxisPropertyKey ||
        params.updatedDefinition.yAxisPropertyKey ||
        params.updatedDefinition.seriesName
        /** @todo: check these values actually changed */
      ) {
        await updateChartEntityProperties({
          series: [
            ...series.slice(0, seriesIndex),
            {
              ...previousSeries,
              seriesType:
                params.updatedDefinition.seriesType ??
                previousSeries.seriesType,
              seriesName:
                params.updatedDefinition.seriesName ??
                previousSeries.seriesName,
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
      updateChartEntityProperties,
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

      const { seriesType, xAxisPropertyKey, yAxisPropertyKey, seriesName } =
        definition;

      await updateChartEntityProperties({
        series: [
          ...series,
          {
            seriesId,
            seriesName,
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
      updateChartEntityProperties,
      createLinkedAggregations,
      seriesDefinitions,
      accountId,
      entityId,
    ],
  );

  const handleDeleteSeriesDefinition = React.useCallback(
    async (params: { seriesId: string }) => {
      if (!deleteLinkedAggregations) {
        throw new Error(
          "deleteLinkedAggregations is requried to delete a series definition",
        );
      }

      const aggregation = linkedAggregations.find(
        ({ path }) => path === `$.${params.seriesId}`,
      );

      if (!aggregation) {
        throw new Error(
          `cannot find aggregation with path '$.${params.seriesId}'`,
        );
      }

      await updateChartEntityProperties({
        series: series.filter(({ seriesId }) => seriesId !== params.seriesId),
      });

      await deleteLinkedAggregations([
        {
          sourceAccountId: accountId,
          aggregationId: aggregation.aggregationId,
        },
      ]);
    },
    [
      updateChartEntityProperties,
      deleteLinkedAggregations,
      accountId,
      linkedAggregations,
      series,
    ],
  );

  return (
    <Chart
      title={title}
      updateTitle={(updatedTitle) =>
        updateChartEntityProperties({ title: updatedTitle })
      }
      yAxisName={xAxisLabel}
      xAxisName={yAxisLabel}
      possibleEntityTypes={possibleEntityTypes}
      seriesDefinitions={seriesDefinitions}
      updateSeriesDefinition={handleUpdateSeriesDefinition}
      createSeriesDefinition={handleCreateSeriesDefinition}
      deleteSeriesDefinition={handleDeleteSeriesDefinition}
      config={currentConfigProperties}
    />
  );
};
