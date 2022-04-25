import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import { Graph, SeriesOption, ECOption } from "./graph";

type AppProps = {};

type GraphDefinition = {
  title: string;
  xAxisName: string;
  yAxisName: string;
};

type SeriesDefinition = {
  seriesType: SeriesOption["type"];
  entityTypeId: string;
  xValuePropertyKey: string;
  yValuePropertyKey: string;
};

type Series = NonNullable<ECOption["series"]>;

export const App: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
}) => {
  if (!aggregateEntities) {
    throw new Error("");
  }

  /** @todo: store this on the block entity */
  const [graphDefinition] = React.useState<GraphDefinition>({
    title: "Graph Block",
    xAxisName: "X Axis",
    yAxisName: "Y Axis",
  });

  const [seriesDefinitions] = React.useState<SeriesDefinition[]>([
    {
      seriesType: "scatter",
      entityTypeId: "91288e7d-dde6-47cf-b388-b3330073dba7",
      xValuePropertyKey: "x",
      yValuePropertyKey: "y",
    },
  ]);

  const [series, setSeries] = React.useState<Series>([]);

  const populateSeries = React.useCallback(
    async (definitions: SeriesDefinition[]) => {
      const updatedSeries: Series = await Promise.all(
        definitions.map(
          async ({
            seriesType,
            entityTypeId,
            xValuePropertyKey,
            yValuePropertyKey,
          }) => {
            const { results: allEntitiesOfType } = await aggregateEntities({
              accountId,
              operation: {
                entityTypeId,
              },
            });

            return {
              type: seriesType,
              data: allEntitiesOfType.map((properties) => {
                if (!properties[xValuePropertyKey]) {
                  throw new Error(
                    `No property with key '${xValuePropertyKey}' found on entity`,
                  );
                }
                if (!properties[xValuePropertyKey]) {
                  throw new Error(
                    `No property with key '${xValuePropertyKey}' found on entity`,
                  );
                }

                const xValue = properties[xValuePropertyKey];
                if (typeof xValue !== "number") {
                  throw new Error("The x value is not a number");
                }

                const yValue = properties[yValuePropertyKey];
                if (typeof yValue !== "number") {
                  throw new Error("The y value is not a number");
                }

                return [xValue, yValue];
              }),
            };
          },
        ),
      );

      setSeries(updatedSeries);
    },
    [aggregateEntities, setSeries, accountId],
  );

  React.useEffect(() => {
    void populateSeries(seriesDefinitions);
  }, [seriesDefinitions, populateSeries]);

  return (
    <>
      <h1>{graphDefinition.title}</h1>
      <Graph
        options={{
          yAxis: {
            type: "value",
            name: graphDefinition.yAxisName,
          },
          xAxis: {
            type: "value",
            name: graphDefinition.xAxisName,
          },
          series,
        }}
      />
    </>
  );
};
