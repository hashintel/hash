import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import {
  EntityId,
  EntityRootType,
  MultiFilter,
  Subgraph,
} from "@blockprotocol/graph/temporal";
import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/temporal/stdlib";
import { Box, Divider } from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BarChart } from "./bar-chart";
import {
  EditChartDefinition,
  generateInitialChartDefinition,
} from "./edit-chart-definition";
import { EditableChartTitle } from "./edit-chart-title";
import { ChartDefinition } from "./types/chart-definition";
import {
  BlockEntity,
  BlockEntityOutgoingLinkAndTarget,
  Query,
} from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const { rootEntity: blockEntity } = useEntitySubgraph<
    BlockEntity,
    BlockEntityOutgoingLinkAndTarget[]
  >(blockEntitySubgraph);

  const linkedQueryEntities = useMemo(() => {
    return getOutgoingLinkAndTargetEntities(
      /** @todo: figure out why there is a type mismatch here */
      blockEntitySubgraph as unknown as Subgraph,
      blockEntity.metadata.recordId.entityId,
    )
      .filter(
        ({ linkEntity: linkEntityRevisions }) =>
          linkEntityRevisions[0]!.metadata.entityTypeId ===
          "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1",
      )
      .map(
        ({ rightEntity: rightEntityRevisions }) =>
          rightEntityRevisions[0] as unknown as Query,
      );
  }, [blockEntity, blockEntitySubgraph]);

  const [queryResults, setQueryResults] = useState<
    Record<EntityId, Subgraph<EntityRootType>>
  >({});

  const fetchQueryEntityResults = useCallback(
    async (queryEntity: Query) => {
      const { data } = await graphModule.queryEntities({
        data: {
          operation: {
            multiFilter: queryEntity.properties[
              "https://blockprotocol.org/@hash/types/property-type/query/"
            ] as MultiFilter,
          },
          graphResolveDepths: {
            inheritsFrom: { outgoing: 255 },
            isOfType: { outgoing: 1 },
            constrainsPropertiesOn: { outgoing: 255 },
          },
        },
      });

      /** @todo: improve error handling */
      if (!data) {
        throw new Error("Could not fetch query entity results");
      }

      /** @todo: figure out why `data` is typed wrong */
      const subgraph = data as unknown as Subgraph<EntityRootType>;

      setQueryResults((prev) => ({
        ...prev,
        [queryEntity.metadata.recordId.entityId]: subgraph,
      }));
    },
    [graphModule],
  );

  useEffect(() => {
    void Promise.all(
      linkedQueryEntities
        .filter(
          (queryEntity) =>
            !queryResults[queryEntity.metadata.recordId.entityId],
        )
        .map(fetchQueryEntityResults),
    );
  }, [linkedQueryEntities, queryResults, fetchQueryEntityResults]);

  const chartDefinition = blockEntity.properties[
    "https://blockprotocol.org/@hash/types/property-type/chart-defintion/"
  ] as ChartDefinition | undefined;

  const updateChartDefinition = useCallback(
    async (updatedChartDefinition: ChartDefinition) => {
      await graphModule.updateEntity({
        data: {
          entityId: blockEntity.metadata.recordId.entityId,
          entityTypeId: blockEntity.metadata.entityTypeId,
          properties: {
            ...blockEntity.properties,
            "https://blockprotocol.org/@benwerner/types/property-type/chart-definition/":
              updatedChartDefinition,
          } as BlockEntity["properties"],
        },
      });
    },
    [graphModule, blockEntity],
  );

  const title =
    blockEntity.properties[
      "https://blockprotocol.org/@blockprotocol/types/property-type/title/"
    ];

  const updateTitle = useCallback(
    async (updatedTitle: string) => {
      await graphModule.updateEntity({
        data: {
          entityId: blockEntity.metadata.recordId.entityId,
          entityTypeId: blockEntity.metadata.entityTypeId,
          properties: {
            ...blockEntity.properties,
            "https://blockprotocol.org/@blockprotocol/types/property-type/title/":
              updatedTitle,
          } as BlockEntity["properties"],
        },
      });
    },
    [graphModule, blockEntity],
  );

  const allQueriesAreFetched = useMemo(
    () => Object.keys(queryResults).length === linkedQueryEntities.length,
    [linkedQueryEntities, queryResults],
  );

  useEffect(() => {
    if (allQueriesAreFetched && !chartDefinition) {
      const generatedChartDefinition = generateInitialChartDefinition({
        queryResults,
      });

      if (generatedChartDefinition) {
        void updateChartDefinition(generatedChartDefinition);
      }
    }
  }, [
    queryResults,
    allQueriesAreFetched,
    updateChartDefinition,
    chartDefinition,
  ]);

  return (
    <Box ref={blockRootRef}>
      <EditableChartTitle
        title={title ?? "Untitled Chart"}
        updateTitle={updateTitle}
      />
      {chartDefinition ? (
        <BarChart definition={chartDefinition} queryResults={queryResults} />
      ) : null}
      <Divider />
      <Box marginTop={2}>
        {allQueriesAreFetched ? (
          <EditChartDefinition
            key={blockEntity.metadata.recordId.editionId}
            initialChartDefinition={chartDefinition}
            queryResults={queryResults}
            onSubmit={updateChartDefinition}
          />
        ) : null}
      </Box>
    </Box>
  );
};
