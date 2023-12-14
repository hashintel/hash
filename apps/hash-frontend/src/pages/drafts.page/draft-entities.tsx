import { useQuery } from "@apollo/client";
import { Skeleton } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  fullDecisionTimeAxis,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  Entity,
  EntityId,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Container, Divider, Typography } from "@mui/material";
import { subDays, subHours } from "date-fns";
import { Fragment, FunctionComponent, useMemo, useRef, useState } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { useDraftEntities } from "../../shared/draft-entities-context";
import { getFirstRevision } from "../../shared/entity-utils";
import { Button } from "../../shared/ui";
import { MinimalActor, useActors } from "../../shared/use-actors";
import {
  DraftEntitiesFilters,
  DraftEntityFilterState,
  generateDefaultFilterState,
  LastEditedTimeRanges,
} from "./draft-entities/draft-entities-filters";
import { DraftEntity } from "./draft-entity";

const incrementNumberOfEntitiesToDisplay = 20;

const doesSubgraphIncludeEntitiesInRoots = (params: {
  subgraph: Subgraph<EntityRootType>;
  entityIds: EntityId[];
}) => {
  const roots = getRoots(params.subgraph);

  return params.entityIds.every((entityId) =>
    roots.some((root) => root.metadata.recordId.entityId === entityId),
  );
};

const isDateWithinLastEditedTimeRange = (params: {
  date: Date;
  lastEditedTimeRange: LastEditedTimeRanges;
}) => {
  const { date, lastEditedTimeRange } = params;
  const now = new Date();
  switch (lastEditedTimeRange) {
    case "anytime":
      return true;
    case "last-24-hours":
      return date >= subHours(now, 1);
    case "last-7-days":
      return date >= subDays(now, 7);
    case "last-30-days":
      return date >= subDays(now, 30);
    case "last-365-days":
      return date >= subDays(now, 365);
    default:
      return true;
  }
};

export type SortOrder = "created-at-asc" | "created-at-desc";

export const DraftEntities: FunctionComponent<{ sortOrder: SortOrder }> = ({
  sortOrder,
}) => {
  const [filterState, setFilterState] = useState<DraftEntityFilterState>();

  const { draftEntities, draftEntitiesSubgraph } = useDraftEntities();

  const [
    previouslyFetchedDraftEntityHistoriesData,
    setPreviouslyFetchedDraftEntityHistoriesData,
  ] = useState<StructuralQueryEntitiesQuery>();

  const { data: draftEntityHistoriesData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      query: {
        filter: {
          any:
            draftEntities?.map((draftEntity) => ({
              equal: [
                { path: ["uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(
                    draftEntity.metadata.recordId.entityId,
                  ),
                },
              ],
            })) ?? [],
        },
        includeDrafts: true,
        temporalAxes: fullDecisionTimeAxis,
        graphResolveDepths: zeroedGraphResolveDepths,
      },
      includePermissions: false,
    },
    skip: !draftEntities,
    onCompleted: (data) => setPreviouslyFetchedDraftEntityHistoriesData(data),
  });

  const draftEntityHistoriesSubgraph = useMemo(
    () =>
      draftEntityHistoriesData || previouslyFetchedDraftEntityHistoriesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            (draftEntityHistoriesData ??
              previouslyFetchedDraftEntityHistoriesData)!
              .structuralQueryEntities.subgraph,
          )
        : undefined,
    [draftEntityHistoriesData, previouslyFetchedDraftEntityHistoriesData],
  );

  const creatorAccountIds = useMemo(() => {
    if (
      !draftEntities ||
      !draftEntityHistoriesSubgraph ||
      // We may have a stale subgraph that doesn't contain the revisions for all of the draft entities yet
      !doesSubgraphIncludeEntitiesInRoots({
        subgraph: draftEntityHistoriesSubgraph,
        entityIds: draftEntities.map(
          (entity) => entity.metadata.recordId.entityId,
        ),
      })
    ) {
      return undefined;
    }

    const derivedCreatorAccountIds = draftEntities.map((entity) => {
      const firstRevision = getFirstRevision(
        draftEntityHistoriesSubgraph,
        entity.metadata.recordId.entityId,
      );

      return firstRevision.metadata.provenance.recordCreatedById;
    });

    return derivedCreatorAccountIds;
  }, [draftEntities, draftEntityHistoriesSubgraph]);

  const { actors } = useActors({ accountIds: creatorAccountIds });

  const previousDraftEntitiesWithCreatedAtAndCreators = useRef<
    | {
        entity: Entity;
        createdAt: Date;
        creator: MinimalActor;
      }[]
    | null
  >(null);

  const draftEntitiesWithCreatedAtAndCreators = useMemo(() => {
    if (!draftEntities || !draftEntityHistoriesSubgraph || !actors) {
      return previousDraftEntitiesWithCreatedAtAndCreators.current ?? undefined;
    }

    const derived = draftEntities.map((entity) => {
      const firstRevision = getFirstRevision(
        draftEntityHistoriesSubgraph,
        entity.metadata.recordId.entityId,
      );

      const creator = actors.find(
        (actor) =>
          actor.accountId ===
          firstRevision.metadata.provenance.recordCreatedById,
      );

      if (!creator) {
        throw new Error(
          `Could not find creator for draft entity ${entity.metadata.recordId.entityId}`,
        );
      }

      return {
        entity,
        createdAt: new Date(
          firstRevision.metadata.temporalVersioning.decisionTime.start.limit,
        ),
        creator,
      };
    });

    previousDraftEntitiesWithCreatedAtAndCreators.current = derived;

    return derived;
  }, [actors, draftEntityHistoriesSubgraph, draftEntities]);

  if (
    !filterState &&
    draftEntitiesWithCreatedAtAndCreators &&
    draftEntitiesSubgraph
  ) {
    setFilterState(
      generateDefaultFilterState({
        draftEntitiesWithCreatedAtAndCreators,
        draftEntitiesSubgraph,
      }),
    );
  }

  const filteredAndSortedDraftEntitiesWithCreatedAt = useMemo(
    () =>
      filterState &&
      draftEntitiesWithCreatedAtAndCreators &&
      draftEntitiesSubgraph
        ? draftEntitiesWithCreatedAtAndCreators
            .filter(
              ({ entity, creator }) =>
                filterState.entityTypeBaseUrls.includes(
                  extractBaseUrl(entity.metadata.entityTypeId),
                ) &&
                filterState.sourceAccountIds.includes(creator.accountId) &&
                isDateWithinLastEditedTimeRange({
                  date: new Date(
                    entity.metadata.temporalVersioning.decisionTime.start.limit,
                  ),
                  lastEditedTimeRange: filterState.lastEditedTimeRange,
                }),
            )
            .sort((a, b) =>
              a.createdAt.getTime() === b.createdAt.getTime()
                ? generateEntityLabel(
                    draftEntitiesSubgraph,
                    a.entity,
                  ).localeCompare(
                    generateEntityLabel(draftEntitiesSubgraph, b.entity),
                  )
                : sortOrder === "created-at-asc"
                  ? a.createdAt.getTime() - b.createdAt.getTime()
                  : b.createdAt.getTime() - a.createdAt.getTime(),
            )
        : undefined,
    [
      draftEntitiesWithCreatedAtAndCreators,
      sortOrder,
      filterState,
      draftEntitiesSubgraph,
    ],
  );

  const [numberOfIncrements, setNumberOfIncrements] = useState(1);

  const numberOfEntitiesToDisplay =
    incrementNumberOfEntitiesToDisplay * numberOfIncrements;

  return (
    <Container
      sx={{
        display: "flex",
        columnGap: 3.5,
        alignItems: "flex-start",
        paddingTop: 3,
        paddingBottom: 6,
      }}
    >
      <Box
        sx={{
          flexGrow: 1,
        }}
      >
        {filteredAndSortedDraftEntitiesWithCreatedAt &&
        filteredAndSortedDraftEntitiesWithCreatedAt.length === 0 ? (
          <Typography textAlign="center">
            {draftEntitiesWithCreatedAtAndCreators?.length === 0
              ? "You have no drafts currently awaiting review."
              : "No draft entities match the selected filters."}
          </Typography>
        ) : (
          <>
            <Box
              sx={{
                background: ({ palette }) => palette.common.white,
                borderRadius: "8px",
                borderColor: ({ palette }) => palette.gray[30],
                borderWidth: 1,
                borderStyle: "solid",
                flexGrow: 1,
              }}
            >
              {filteredAndSortedDraftEntitiesWithCreatedAt &&
              draftEntitiesSubgraph ? (
                <>
                  {filteredAndSortedDraftEntitiesWithCreatedAt
                    /**
                     * @todo: use pagination instead
                     */
                    .slice(0, numberOfEntitiesToDisplay)
                    .map(({ entity, createdAt }, i, all) => (
                      <Fragment key={entity.metadata.recordId.entityId}>
                        <DraftEntity
                          entity={entity}
                          createdAt={createdAt}
                          subgraph={draftEntitiesSubgraph}
                        />
                        {i < all.length - 1 ? (
                          <Divider
                            sx={{
                              borderColor: ({ palette }) => palette.gray[30],
                            }}
                          />
                        ) : null}
                      </Fragment>
                    ))}
                </>
              ) : (
                <Box paddingY={4.5} paddingX={3.25}>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    marginBottom={1.5}
                  >
                    <Skeleton height={30} width={150} />
                    <Box display="flex" columnGap={1}>
                      <Skeleton height={40} width={100} />
                      <Skeleton height={40} width={100} />
                    </Box>
                  </Box>
                  <Box display="flex" justifyContent="space-between">
                    <Skeleton height={26} width={350} />
                    <Skeleton height={26} width={250} />
                  </Box>
                </Box>
              )}
            </Box>
            {filteredAndSortedDraftEntitiesWithCreatedAt &&
            filteredAndSortedDraftEntitiesWithCreatedAt.length >
              numberOfEntitiesToDisplay ? (
              <Box display="flex" width="100%" justifyContent="center">
                <Button
                  size="medium"
                  sx={{ marginTop: 3 }}
                  onClick={() => setNumberOfIncrements((prev) => prev + 1)}
                >
                  Display{" "}
                  {Math.min(
                    filteredAndSortedDraftEntitiesWithCreatedAt.length -
                      numberOfEntitiesToDisplay,
                    incrementNumberOfEntitiesToDisplay,
                  )}{" "}
                  more drafts
                </Button>
              </Box>
            ) : null}
          </>
        )}
      </Box>
      {draftEntitiesWithCreatedAtAndCreators &&
      draftEntitiesWithCreatedAtAndCreators.length === 0 ? null : (
        <DraftEntitiesFilters
          draftEntitiesWithCreatedAtAndCreators={
            draftEntitiesWithCreatedAtAndCreators
          }
          draftEntitiesSubgraph={draftEntitiesSubgraph}
          filterState={filterState}
          setFilterState={setFilterState}
        />
      )}
    </Container>
  );
};
