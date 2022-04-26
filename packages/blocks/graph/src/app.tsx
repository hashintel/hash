import * as React from "react";
import { BlockProtocolEntityType } from "blockprotocol";

import { BlockComponent } from "blockprotocol/react";
import { Graph, SeriesType } from "./graph";

type AppProps = {
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

export const App: BlockComponent<AppProps> = ({
  entityId,
  accountId,
  aggregateEntities,
  aggregateEntityTypes,
  updateEntities,
  title = "Graph Title",
  xAxisLabel = "X Axis",
  yAxisLabel = "Y Axis",
}) => {
  const [possibleEntityTypes, setPossibleEntityTypes] = React.useState<
    BlockProtocolEntityType[]
  >([]);

  React.useEffect(() => {
    if (!aggregateEntityTypes) {
      throw new Error("aggregateEntityTypes needs to be defined");
    }
    void aggregateEntityTypes({ accountId }).then(({ results }) =>
      setPossibleEntityTypes(results),
    );
  }, [aggregateEntityTypes, accountId]);

  const fetchEntitiesOfType = React.useCallback(
    (params: { entityTypeId: string }) => {
      if (!aggregateEntities) {
        throw new Error(
          "aggregateEntities is required to render the Graph block",
        );
      }

      const { entityTypeId } = params;

      return aggregateEntities({
        accountId,
        operation: { entityTypeId },
      }).then(({ results }) => results);
    },
    [aggregateEntities, accountId],
  );

  const updateGraphEntityProperties = React.useCallback(
    async (
      updatedProperties: Partial<{
        title: string;
        xAxisLabel: string;
        yAxisLabel: string;
      }>,
    ) => {
      if (!updateEntities) throw new Error("");
      if (!entityId) throw new Error("");

      await updateEntities([{ accountId, entityId, data: updatedProperties }]);
    },
    [updateEntities, entityId, accountId],
  );

  return (
    <Graph
      title={title}
      updateTitle={(updatedTitle) =>
        updateGraphEntityProperties({ title: updatedTitle })
      }
      yAxisName={xAxisLabel}
      xAxisName={yAxisLabel}
      fetchEntitiesOfType={fetchEntitiesOfType}
      possibleEntityTypes={possibleEntityTypes}
    />
  );
};
