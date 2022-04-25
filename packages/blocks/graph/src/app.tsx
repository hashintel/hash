import * as React from "react";

import { BlockComponent } from "blockprotocol/react";
import { Graph } from "./graph";

type AppProps = {};

export const App: BlockComponent<AppProps> = ({
  accountId,
  aggregateEntities,
}) => {
  return (
    <Graph
      title="Graph"
      yAxisName="Y Axis"
      xAxisName="X Axis"
      fetchEntitiesOfType={({ entityTypeId }) => {
        if (!aggregateEntities) {
          throw new Error(
            "aggregateEntities is required to render the Graph block",
          );
        }

        return aggregateEntities({
          accountId,
          operation: { entityTypeId },
        }).then(({ results }) => results);
      }}
    />
  );
};
