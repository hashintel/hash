import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import { Skeleton } from "@hashintel/design-system";
import {
  getClosedMultiEntityTypeFromMap,
  type HashEntity,
} from "@local/hash-graph-sdk/entity";
import type { ClosedMultiEntityTypesRootMap } from "@local/hash-graph-sdk/ontology";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { Box, Container, Divider, Typography } from "@mui/material";
import type { Dispatch, FunctionComponent, SetStateAction } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "../../shared/ui";
import type { MinimalActor } from "../../shared/use-actors";
import { useActors } from "../../shared/use-actors";
import { DraftEntitiesContextBar } from "./draft-entities/draft-entities-context-bar";
import type { DraftEntityFilterState } from "./draft-entities/draft-entities-filters";
import {
  DraftEntitiesFilters,
  filterDraftEntities,
  generateDefaultFilterState,
  getDraftEntityTypeBaseUrls,
  isFilerStateDefaultFilterState,
} from "./draft-entities/draft-entities-filters";
import type { EntityTypeDisplayInfoByBaseUrl } from "./draft-entities/types";
import { useDraftEntities } from "./draft-entities-context";
import { DraftEntity } from "./draft-entity";

const incrementNumberOfEntitiesToDisplay = 20;

export type SortOrder = "created-at-asc" | "created-at-desc";

export const DraftEntities: FunctionComponent<{
  closedMultiEntityTypesRootMap?: ClosedMultiEntityTypesRootMap;
  entityTypeDisplayInfoByBaseUrl?: EntityTypeDisplayInfoByBaseUrl;
  sortOrder: SortOrder;
  selectedDraftEntityIds: EntityId[];
  setSelectedDraftEntityIds: Dispatch<SetStateAction<EntityId[]>>;
  draftEntitiesWithLinkedDataSubgraph?: Subgraph<EntityRootType<HashEntity>>;
}> = ({
  closedMultiEntityTypesRootMap,
  entityTypeDisplayInfoByBaseUrl,
  sortOrder,
  selectedDraftEntityIds,
  setSelectedDraftEntityIds,
  draftEntitiesWithLinkedDataSubgraph,
}) => {
  const [filterState, setFilterState] = useState<DraftEntityFilterState>();

  const { draftEntities } = useDraftEntities();

  const creatorAccountIds = useMemo(
    () =>
      draftEntities?.map(
        (entity) => entity.metadata.provenance.edition.createdById,
      ),
    [draftEntities],
  );

  const { actors } = useActors({ accountIds: creatorAccountIds });

  const previousDraftEntitiesWithCreators = useRef<
    | {
        entity: HashEntity;
        creator: MinimalActor;
      }[]
    | null
  >(null);

  const draftEntitiesWithCreators = useMemo(() => {
    if (!draftEntities || !actors) {
      return previousDraftEntitiesWithCreators.current ?? undefined;
    }

    const derived = draftEntities.map((entity) => {
      const creator = actors.find(
        (actor) =>
          actor.accountId === entity.metadata.provenance.edition.createdById,
      );

      if (!creator) {
        throw new Error(
          `Could not find creator for draft entity ${entity.metadata.recordId.entityId}`,
        );
      }

      return { entity, creator };
    });

    previousDraftEntitiesWithCreators.current = derived;

    return derived;
  }, [actors, draftEntities]);

  const [
    previouslyEvaluatedDraftEntityTypeBaseUrls,
    setPreviouslyEvaluatedDraftEntityTypeBaseUrls,
  ] = useState<BaseUrl[]>();

  if (
    !filterState &&
    draftEntitiesWithCreators &&
    draftEntitiesWithLinkedDataSubgraph
  ) {
    const newDraftFilterState = generateDefaultFilterState({
      draftEntitiesWithCreators,
    });

    // Note that the initial filter state includes all draft entity type Base URLs
    setPreviouslyEvaluatedDraftEntityTypeBaseUrls(
      newDraftFilterState.entityTypeBaseUrls,
    );

    setFilterState(newDraftFilterState);
  }

  const rootEntityTypeBaseUrls = useMemo(
    () =>
      draftEntitiesWithCreators && draftEntitiesWithLinkedDataSubgraph
        ? getDraftEntityTypeBaseUrls({
            draftEntities: draftEntitiesWithCreators.map(
              ({ entity }) => entity,
            ),
          })
        : undefined,
    [draftEntitiesWithCreators, draftEntitiesWithLinkedDataSubgraph],
  );

  const newDraftEntityTypeBaseUrls = useMemo(
    () =>
      rootEntityTypeBaseUrls &&
      previouslyEvaluatedDraftEntityTypeBaseUrls &&
      rootEntityTypeBaseUrls.filter(
        (entityTypeBaseUrl) =>
          !previouslyEvaluatedDraftEntityTypeBaseUrls.includes(
            entityTypeBaseUrl,
          ),
      ),
    [rootEntityTypeBaseUrls, previouslyEvaluatedDraftEntityTypeBaseUrls],
  );

  if (newDraftEntityTypeBaseUrls && newDraftEntityTypeBaseUrls.length > 0) {
    /**
     * If a draft entity of a new type has been added to the subgraph,
     * we want to add it to the filter state so that the entity isn't
     * filtered out of view when it has been added.
     */
    setPreviouslyEvaluatedDraftEntityTypeBaseUrls((prev) => [
      ...(prev ?? []),
      ...newDraftEntityTypeBaseUrls,
    ]);

    setFilterState((prev) =>
      prev
        ? {
            ...prev,
            entityTypeBaseUrls: [
              ...prev.entityTypeBaseUrls,
              ...newDraftEntityTypeBaseUrls,
            ],
          }
        : prev,
    );
  }

  const isDefaultFilterState = useMemo(
    () =>
      !!filterState &&
      !!draftEntitiesWithCreators &&
      !!draftEntitiesWithLinkedDataSubgraph &&
      isFilerStateDefaultFilterState({
        draftEntitiesWithCreators,
      })(filterState),
    [
      filterState,
      draftEntitiesWithCreators,
      draftEntitiesWithLinkedDataSubgraph,
    ],
  );

  const filteredAndSortedDraftEntitiesWithCreatedAt = useMemo(
    () =>
      filterState && draftEntitiesWithCreators
        ? filterDraftEntities({
            draftEntitiesWithCreators,
            filterState,
          }).sort((a, b) => {
            const aCreatedAt = new Date(
              a.entity.metadata.temporalVersioning.decisionTime.start.limit,
            );
            const bCreatedAt = new Date(
              b.entity.metadata.temporalVersioning.decisionTime.start.limit,
            );

            const aType = getClosedMultiEntityTypeFromMap(
              closedMultiEntityTypesRootMap,
              a.entity.metadata.entityTypeIds,
            );

            const bType = getClosedMultiEntityTypeFromMap(
              closedMultiEntityTypesRootMap,
              b.entity.metadata.entityTypeIds,
            );

            return aCreatedAt.getTime() === bCreatedAt.getTime()
              ? generateEntityLabel(aType, a.entity).localeCompare(
                  generateEntityLabel(bType, b.entity),
                )
              : sortOrder === "created-at-asc"
                ? aCreatedAt.getTime() - bCreatedAt.getTime()
                : bCreatedAt.getTime() - aCreatedAt.getTime();
          })
        : undefined,
    [
      draftEntitiesWithCreators,
      sortOrder,
      filterState,
      closedMultiEntityTypesRootMap,
    ],
  );

  useEffect(() => {
    if (filteredAndSortedDraftEntitiesWithCreatedAt) {
      /**
       * If the filter state has changed, there may be previously selected drafts
       * which are no longer listed in the UI which we need to deselect.
       */
      const nonMatchingSelectedDraftEntityIds = selectedDraftEntityIds.filter(
        (selectedDraftEntityId) =>
          !filteredAndSortedDraftEntitiesWithCreatedAt.some(
            ({ entity }) =>
              entity.metadata.recordId.entityId === selectedDraftEntityId,
          ),
      );

      if (nonMatchingSelectedDraftEntityIds.length > 0) {
        setSelectedDraftEntityIds((prev) =>
          prev.filter(
            (selectedDraftEntityId) =>
              !nonMatchingSelectedDraftEntityIds.includes(
                selectedDraftEntityId,
              ),
          ),
        );
      }
    }
  }, [
    filteredAndSortedDraftEntitiesWithCreatedAt,
    selectedDraftEntityIds,
    setSelectedDraftEntityIds,
  ]);

  const [numberOfIncrements, setNumberOfIncrements] = useState(1);

  useLayoutEffect(() => {
    setNumberOfIncrements(1);
  }, [sortOrder]);

  const handleFilterStateChange = useCallback<
    Dispatch<SetStateAction<DraftEntityFilterState | undefined>>
  >((updatedFilterState) => {
    setFilterState(updatedFilterState);
    setNumberOfIncrements(1);
  }, []);

  const numberOfEntitiesToDisplay =
    incrementNumberOfEntitiesToDisplay * numberOfIncrements;

  const displayedDraftEntitiesWithCreatedAt = useMemo(
    () =>
      filteredAndSortedDraftEntitiesWithCreatedAt
        ? /**
           * @todo: use pagination instead
           */
          filteredAndSortedDraftEntitiesWithCreatedAt.slice(
            0,
            numberOfEntitiesToDisplay,
          )
        : undefined,
    [filteredAndSortedDraftEntitiesWithCreatedAt, numberOfEntitiesToDisplay],
  );

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
            {draftEntitiesWithCreators?.length === 0
              ? "You have no actions currently awaiting review."
              : "No items entities match the selected filters."}
          </Typography>
        ) : (
          <>
            <DraftEntitiesContextBar
              isDefaultFilterState={isDefaultFilterState}
              draftEntities={draftEntities}
              selectedDraftEntityIds={selectedDraftEntityIds}
              setSelectedDraftEntityIds={setSelectedDraftEntityIds}
              displayedDraftEntities={displayedDraftEntitiesWithCreatedAt?.map(
                ({ entity }) => entity,
              )}
              matchingDraftEntities={filteredAndSortedDraftEntitiesWithCreatedAt?.map(
                ({ entity }) => entity,
              )}
            />
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
              {displayedDraftEntitiesWithCreatedAt &&
              draftEntitiesWithLinkedDataSubgraph &&
              entityTypeDisplayInfoByBaseUrl ? (
                <>
                  {displayedDraftEntitiesWithCreatedAt.map(
                    ({ entity }, i, all) => {
                      const isSelected = selectedDraftEntityIds.includes(
                        entity.metadata.recordId.entityId,
                      );
                      return (
                        <Fragment key={entity.metadata.recordId.entityId}>
                          <DraftEntity
                            closedMultiEntityTypesRootMap={
                              closedMultiEntityTypesRootMap
                            }
                            entity={entity}
                            entityTypeDisplayInfoByBaseUrl={
                              entityTypeDisplayInfoByBaseUrl
                            }
                            subgraph={draftEntitiesWithLinkedDataSubgraph}
                            selected={isSelected}
                            toggleSelected={() =>
                              setSelectedDraftEntityIds((prev) =>
                                isSelected
                                  ? prev.filter(
                                      (entityId) =>
                                        entityId !==
                                        entity.metadata.recordId.entityId,
                                    )
                                  : [
                                      ...prev,
                                      entity.metadata.recordId.entityId,
                                    ],
                              )
                            }
                          />
                          {i < all.length - 1 ? (
                            <Divider
                              sx={{
                                borderColor: ({ palette }) => palette.gray[30],
                              }}
                            />
                          ) : null}
                        </Fragment>
                      );
                    },
                  )}
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
      {draftEntitiesWithCreators &&
      draftEntitiesWithCreators.length === 0 ? null : (
        <DraftEntitiesFilters
          entityTypeDisplayInfoByBaseUrl={entityTypeDisplayInfoByBaseUrl}
          draftEntitiesWithCreators={draftEntitiesWithCreators}
          draftEntitiesSubgraph={draftEntitiesWithLinkedDataSubgraph}
          filterState={filterState}
          setFilterState={handleFilterStateChange}
        />
      )}
    </Container>
  );
};
