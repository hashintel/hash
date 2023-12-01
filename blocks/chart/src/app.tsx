import {
  EntityId,
  EntityRootType,
  MultiFilter,
  Subgraph,
} from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import { EntitiesGraphChart, GearIcon } from "@hashintel/block-design-system";
import { theme } from "@hashintel/design-system/theme";
import {
  Box,
  Collapse,
  Divider,
  IconButton,
  ThemeProvider,
} from "@mui/material";
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
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const [displayEditChartDefinition, setDisplayEditChartDefinition] =
    useState<boolean>(false);

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
          linkEntityRevisions.metadata.entityTypeId ===
          "https://blockprotocol.org/@hash/types/entity-type/has-query/v/1",
      )
      .map(
        ({ rightEntity: rightEntityRevisions }) =>
          rightEntityRevisions as unknown as Query,
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
            "https://blockprotocol.org/@hash/types/property-type/chart-defintion/":
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
    <ThemeProvider theme={theme}>
      <Box
        ref={blockRootRef}
        sx={{
          position: "relative",
          borderRadius: "6px",
          borderColor: ({ palette }) => palette.gray[20],
          borderWidth: 1,
          borderStyle: "solid",
        }}
      >
        <EditableChartTitle
          title={title ?? "Untitled Chart"}
          updateTitle={updateTitle}
          sx={
            chartDefinition?.kind === "graph-chart"
              ? {
                  position: "absolute",
                  top: 0,
                  zIndex: 1,
                }
              : undefined
          }
        />
        {readonly ? null : (
          <IconButton
            sx={{ position: "absolute", right: 1, top: 1 }}
            onClick={() =>
              setDisplayEditChartDefinition(!displayEditChartDefinition)
            }
          >
            <GearIcon />
          </IconButton>
        )}
        {chartDefinition ? (
          chartDefinition.kind === "bar-chart" ? (
            <BarChart
              /** @todo: figure out why TS is not inferring this */
              definition={chartDefinition as ChartDefinition<"bar-chart">}
              queryResults={queryResults}
            />
          ) : (
            /** @todo: account for multiple query results */
            <EntitiesGraphChart
              subgraph={Object.values(queryResults)[0]}
              isPrimaryEntity={(entity) => {
                const subgraph = Object.values(queryResults)[0];
                return (
                  !!subgraph &&
                  getRoots(subgraph).some(
                    (rootEntity) =>
                      entity.metadata.recordId.entityId ===
                      rootEntity.metadata.recordId.entityId,
                  )
                );
              }}
            />
          )
        ) : null}
        <Collapse in={displayEditChartDefinition}>
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
        </Collapse>
      </Box>
    </ThemeProvider>
  );
};
