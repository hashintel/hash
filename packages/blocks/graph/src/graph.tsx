import { BlockProtocolEntity } from "blockprotocol";
import * as React from "react";

import { EChart, SeriesOption, ECOption } from "./e-chart";

type GraphProps = {
  title: string;
  xAxisName: string;
  yAxisName: string;
  fetchEntitiesOfType: (params: {
    entityTypeId: string;
  }) => Promise<BlockProtocolEntity[]>;
};

type SeriesDefinition = {
  seriesType: SeriesOption["type"];
  entityTypeId: string;
  xValuePropertyKey: string;
  yValuePropertyKey: string;
};

type Series = NonNullable<ECOption["series"]>;

export const Graph: React.FC<GraphProps> = ({
  title,
  xAxisName,
  yAxisName,
  fetchEntitiesOfType,
}) => {
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
            const allEntitiesOfType = await fetchEntitiesOfType({
              entityTypeId,
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
    [fetchEntitiesOfType, setSeries],
  );

  React.useEffect(() => {
    void populateSeries(seriesDefinitions);
  }, [seriesDefinitions, populateSeries]);

  return (
    <>
      <h1>{title}</h1>
      <EChart
        options={{
          yAxis: {
            type: "value",
            name: yAxisName,
          },
          xAxis: {
            type: "value",
            name: xAxisName,
          },
          series,
        }}
      />
    </>
  );
};
