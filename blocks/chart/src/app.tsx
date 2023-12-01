import { EntityRootType, MultiFilter, Subgraph } from "@blockprotocol/graph";
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
import { EditChartDefinition } from "./edit-chart-definition";
import { generateInitialChartDefinition } from "./edit-chart-definition/bar-chart-definition-form";
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

  const linkedQueryEntity = useMemo(() => {
    const linkedQueryEntities = getOutgoingLinkAndTargetEntities(
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

    return linkedQueryEntities[0];
  }, [blockEntity, blockEntitySubgraph]);

  const [queryResult, setQueryResult] = useState<Subgraph<EntityRootType>>();

  const fetchQueryEntityResults = useCallback(
    async (params: {
      queryEntity: Query;
      incomingLinksDepth?: number;
      outgoingLinksDepth?: number;
    }) => {
      const { queryEntity, incomingLinksDepth, outgoingLinksDepth } = params;

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
            hasLeftEntity: {
              outgoing: outgoingLinksDepth ?? 0,
              incoming: incomingLinksDepth ?? 0,
            },
            hasRightEntity: {
              outgoing: incomingLinksDepth ?? 0,
              incoming: outgoingLinksDepth ?? 0,
            },
          },
        },
      });

      /** @todo: improve error handling */
      if (!data) {
        throw new Error("Could not fetch query entity results");
      }

      /** @todo: figure out why `data` is typed wrong */
      const subgraph = data as unknown as Subgraph<EntityRootType>;

      setQueryResult(subgraph);
    },
    [graphModule],
  );

  const chartDefinition = blockEntity.properties[
    "https://blockprotocol.org/@hash/types/property-type/chart-defintion/"
  ] as ChartDefinition | undefined;

  useEffect(() => {
    if (linkedQueryEntity) {
      const incomingLinksDepth =
        chartDefinition?.kind === "graph-chart"
          ? (chartDefinition as ChartDefinition<"graph-chart">)
              .incomingLinksDepth
          : undefined;

      const outgoingLinksDepth =
        chartDefinition?.kind === "graph-chart"
          ? (chartDefinition as ChartDefinition<"graph-chart">)
              .outgoingLinksDepth
          : undefined;

      void fetchQueryEntityResults({
        queryEntity: linkedQueryEntity,
        incomingLinksDepth,
        outgoingLinksDepth,
      });
    }
  }, [chartDefinition, linkedQueryEntity, fetchQueryEntityResults]);

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

  useEffect(() => {
    if (queryResult && !chartDefinition) {
      const generatedChartDefinition = generateInitialChartDefinition({
        queryResult,
      });

      if (generatedChartDefinition) {
        void updateChartDefinition(generatedChartDefinition);
      }
    }
  }, [queryResult, updateChartDefinition, chartDefinition]);

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
            sx={{
              zIndex: 2,
              position: "absolute",
              right: ({ spacing }) => spacing(1),
              top: ({ spacing }) => spacing(1),
            }}
            onClick={() =>
              setDisplayEditChartDefinition(!displayEditChartDefinition)
            }
          >
            <GearIcon />
          </IconButton>
        )}
        {chartDefinition ? (
          chartDefinition.kind === "bar-chart" ? (
            queryResult ? (
              <BarChart
                /** @todo: figure out why TS is not inferring this */
                definition={chartDefinition as ChartDefinition<"bar-chart">}
                queryResult={queryResult}
              />
            ) : null
          ) : (
            /** @todo: account for multiple query results */
            <EntitiesGraphChart
              subgraph={queryResult}
              isPrimaryEntity={(entity) =>
                !!queryResult &&
                getRoots(queryResult).some(
                  (rootEntity) =>
                    entity.metadata.recordId.entityId ===
                    rootEntity.metadata.recordId.entityId,
                )
              }
            />
          )
        ) : null}
        <Collapse in={displayEditChartDefinition}>
          <Divider />
          <Box sx={{ marginTop: 2, padding: 3 }}>
            {queryResult ? (
              <EditChartDefinition
                key={blockEntity.metadata.recordId.editionId}
                initialChartDefinition={chartDefinition}
                queryResult={queryResult}
                onSubmit={updateChartDefinition}
              />
            ) : null}
          </Box>
        </Collapse>
      </Box>
    </ThemeProvider>
  );
};
