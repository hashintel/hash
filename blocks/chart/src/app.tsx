import type {
  EntityRootType,
  MultiFilter,
  Subgraph,
} from "@blockprotocol/graph";
import {
  type BlockComponent,
  useEntitySubgraph,
  useGraphBlockModule,
} from "@blockprotocol/graph/react";
import { getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";
import { GearIcon } from "@hashintel/block-design-system";
import { theme } from "@hashintel/design-system/theme";
import {
  Box,
  CircularProgress,
  Collapse,
  Divider,
  Fade,
  IconButton,
  ThemeProvider,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BarChart } from "./bar-chart";
import { EditChartDefinition } from "./edit-chart-definition";
import { generateInitialChartDefinition as generateInitialCountLinkedEntitiesBarChartDefinition } from "./edit-chart-definition/bar-graph-definition-form/count-linked-entities-form";
import { generateInitialChartDefinition as generateInitialGroupByPropertyBarChartDefinition } from "./edit-chart-definition/bar-graph-definition-form/group-by-property-form";
import { EditableChartTitle } from "./edit-chart-title";
import type {
  BarChartDefinitionVariant,
  ChartDefinition,
} from "./types/chart-definition";
import type {
  BlockEntity,
  BlockEntityOutgoingLinkAndTarget,
  Query,
} from "./types/generated/block-entity";

export const App: BlockComponent<BlockEntity> = ({
  graph: { blockEntitySubgraph, readonly },
}) => {
  const blockRootRef = useRef<HTMLDivElement>(null);
  /* @ts-expect-error –– @todo H-3839 packages in BP repo needs updating, or this package updating to use graph in this repo */
  const { graphModule } = useGraphBlockModule(blockRootRef);

  const [displayEditChartDefinition, setDisplayEditChartDefinition] =
    useState<boolean>(true);

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
          rightEntityRevisions as Query,
      );

    return linkedQueryEntities[0];
  }, [blockEntity, blockEntitySubgraph]);

  const [initialLinkedQueryEditionId, setInitialLinkedQueryEditionId] =
    useState<string>();

  if (!initialLinkedQueryEditionId && linkedQueryEntity) {
    setInitialLinkedQueryEditionId(
      linkedQueryEntity.metadata.recordId.editionId,
    );
  }

  const [
    fetchedQueryForLinkedQueryEditionId,
    setFetchedQueryForLinkedQueryEditionId,
  ] = useState<string>();
  const [queryResult, setQueryResult] = useState<Subgraph<EntityRootType>>();
  const [loadingQueryResult, setLoadingQueryResult] = useState<boolean>(false);

  const fetchQueryEntityResults = useCallback(
    async (params: {
      queryEntity: Query;
      incomingLinksDepth?: number;
      outgoingLinksDepth?: number;
    }) => {
      const { queryEntity, incomingLinksDepth, outgoingLinksDepth } = params;

      setLoadingQueryResult(true);

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
              outgoing: incomingLinksDepth ?? 0,
              incoming: outgoingLinksDepth ?? 0,
            },
            hasRightEntity: {
              outgoing: outgoingLinksDepth ?? 0,
              incoming: incomingLinksDepth ?? 0,
            },
          },
        },
      });

      setLoadingQueryResult(false);

      /** @todo: improve error handling */
      if (!data) {
        throw new Error("Could not fetch query entity results");
      }

      setFetchedQueryForLinkedQueryEditionId(
        queryEntity.metadata.recordId.editionId,
      );
      setQueryResult(data.results);
    },
    [graphModule],
  );

  const chartDefinition = blockEntity.properties[
    "https://blockprotocol.org/@hash/types/property-type/chart-defintion/"
  ] as ChartDefinition | undefined;

  useEffect(() => {
    if (linkedQueryEntity) {
      const incomingLinksDepth =
        chartDefinition?.kind === "graph-chart" &&
        chartDefinition.variant === "default"
          ? chartDefinition.incomingLinksDepth
          : chartDefinition?.kind === "bar-chart" &&
              chartDefinition.variant === "count-links"
            ? 1
            : undefined;

      const outgoingLinksDepth =
        chartDefinition?.kind === "graph-chart" &&
        chartDefinition.variant === "default"
          ? chartDefinition.outgoingLinksDepth
          : chartDefinition?.kind === "bar-chart" &&
              chartDefinition.variant === "count-links"
            ? 1
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

  const generatedChartDefinitionForQueryEditionIdRef = useRef<string | null>(
    null,
  );

  if (
    !generatedChartDefinitionForQueryEditionIdRef.current &&
    chartDefinition &&
    fetchedQueryForLinkedQueryEditionId
  ) {
    generatedChartDefinitionForQueryEditionIdRef.current =
      fetchedQueryForLinkedQueryEditionId;
  }

  useEffect(() => {
    if (queryResult && fetchedQueryForLinkedQueryEditionId) {
      if (
        !chartDefinition ||
        (Object.entries(chartDefinition).length === 1 &&
          chartDefinition.kind === "bar-chart")
      ) {
        /**
         * If there isn't an existing chart definition, or if it just specifies `kind: "bar-chart"`,
         * try to generate a bar chart definition from the query result.
         */
        let generatedChartDefinition: BarChartDefinitionVariant | undefined =
          generateInitialGroupByPropertyBarChartDefinition({
            queryResult,
          });

        if (!generatedChartDefinition) {
          generatedChartDefinition =
            generateInitialCountLinkedEntitiesBarChartDefinition({
              queryResult,
            });
        }

        if (generatedChartDefinition) {
          generatedChartDefinitionForQueryEditionIdRef.current =
            fetchedQueryForLinkedQueryEditionId;

          void updateChartDefinition({
            ...generatedChartDefinition,
            kind: "bar-chart",
          });
        }
      } else if (
        chartDefinition.kind === "bar-chart" &&
        generatedChartDefinitionForQueryEditionIdRef.current !==
          fetchedQueryForLinkedQueryEditionId
      ) {
        /**
         * If there is an existing bar chart definition, but the query entity edition has changed,
         * re-generate the chart definition depending on its variant.
         *
         * A more robust approach would be to check which of the individual chart definition fields
         * have become invalid, and only update those to persist prior changes made by the user.
         */
        if (chartDefinition.variant === "count-links") {
          const generatedChartDefinition =
            generateInitialCountLinkedEntitiesBarChartDefinition({
              queryResult,
            });

          if (generatedChartDefinition) {
            generatedChartDefinitionForQueryEditionIdRef.current =
              fetchedQueryForLinkedQueryEditionId;
            void updateChartDefinition({
              ...generatedChartDefinition,
              kind: "bar-chart",
            });
          }
        } else if (chartDefinition.variant === "group-by-property") {
          const generatedChartDefinition =
            generateInitialGroupByPropertyBarChartDefinition({
              queryResult,
            });

          if (generatedChartDefinition) {
            generatedChartDefinitionForQueryEditionIdRef.current =
              fetchedQueryForLinkedQueryEditionId;
            void updateChartDefinition({
              ...generatedChartDefinition,
              kind: "bar-chart",
            });
          }
        }
      }
    }
  }, [
    queryResult,
    updateChartDefinition,
    chartDefinition,
    fetchedQueryForLinkedQueryEditionId,
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
        <Box
          sx={{
            zIndex: 2,
            position: "absolute",
            right: ({ spacing }) => spacing(1),
            top: ({ spacing }) => spacing(1),
            display: "flex",
            columnGap: 1,
            alignItems: "center",
          }}
        >
          <Fade in={loadingQueryResult}>
            <CircularProgress
              size={16}
              sx={{ color: ({ palette }) => palette.gray[40] }}
            />
          </Fade>
          {readonly ? null : (
            <IconButton
              onClick={() =>
                setDisplayEditChartDefinition(!displayEditChartDefinition)
              }
            >
              <GearIcon />
            </IconButton>
          )}
        </Box>
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
            <Box>Unimplemented</Box>
            /** @todo: fix usage of new EntitiesGraphChart */
            // <EntitiesGraphChart
            //   // @ts-expect-error -- The chart requires a temporal subgraph: BP-103
            //   subgraphWithTypes={queryResult}
            //   isPrimaryEntity={(entity) =>
            //     !!queryResult &&
            //     getRoots(queryResult).some(
            //       (rootEntity) =>
            //         entity.metadata.recordId.entityId ===
            //         rootEntity.metadata.recordId.entityId,
            //     )
            //   }
            // />
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
