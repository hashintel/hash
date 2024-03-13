import { Skeleton } from "@hashintel/design-system";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type {
  Entity,
  EntityId,
  EntityRootType,
  Subgraph,
} from "@local/hash-subgraph";
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

import { useDraftEntities } from "../../shared/draft-entities-context";
import { Button } from "../../shared/ui";
import type { MinimalActor } from "../../shared/use-actors";
import { useActors } from "../../shared/use-actors";
import { DraftEntitiesContextBar } from "./draft-entities/draft-entities-context-bar";
import type { DraftEntityFilterState } from "./draft-entities/draft-entities-filters";
import {
  DraftEntitiesFilters,
  filterDraftEntities,
  generateDefaultFilterState,
  isFilerStateDefaultFilterState,
} from "./draft-entities/draft-entities-filters";
import { DraftEntity } from "./draft-entity";

const incrementNumberOfEntitiesToDisplay = 20;

export type SortOrder = "created-at-asc" | "created-at-desc";

export const DraftEntities: FunctionComponent<{
  sortOrder: SortOrder;
  selectedDraftEntityIds: EntityId[];
  setSelectedDraftEntityIds: Dispatch<SetStateAction<EntityId[]>>;
  draftEntitiesWithLinkedDataSubgraph?: Subgraph<EntityRootType>;
}> = ({
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
        entity: Entity;
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
        (actor) => actor.accountId === entity.metadata.provenance.createdById,
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

  if (
    !filterState &&
    draftEntitiesWithCreators &&
    draftEntitiesWithLinkedDataSubgraph
  ) {
    setFilterState(
      generateDefaultFilterState({
        draftEntitiesWithCreators,
        draftEntitiesSubgraph: draftEntitiesWithLinkedDataSubgraph,
      }),
    );
  }

  const isDefaultFilterState = useMemo(
    () =>
      !!filterState &&
      !!draftEntitiesWithCreators &&
      !!draftEntitiesWithLinkedDataSubgraph &&
      isFilerStateDefaultFilterState({
        draftEntitiesWithCreators,
        draftEntitiesSubgraph: draftEntitiesWithLinkedDataSubgraph,
      })(filterState),
    [
      filterState,
      draftEntitiesWithCreators,
      draftEntitiesWithLinkedDataSubgraph,
    ],
  );

  const filteredAndSortedDraftEntitiesWithCreatedAt = useMemo(
    () =>
      filterState &&
      draftEntitiesWithCreators &&
      draftEntitiesWithLinkedDataSubgraph
        ? filterDraftEntities({
            draftEntitiesWithCreators,
            filterState,
          }).sort((a, b) => {
            const aCreatedAt = new Date(
              a.entity.metadata.provenance.createdAtDecisionTime,
            );
            const bCreatedAt = new Date(
              b.entity.metadata.provenance.createdAtDecisionTime,
            );

            return aCreatedAt.getTime() === bCreatedAt.getTime()
              ? generateEntityLabel(
                  draftEntitiesWithLinkedDataSubgraph,
                  a.entity,
                ).localeCompare(
                  generateEntityLabel(
                    draftEntitiesWithLinkedDataSubgraph,
                    b.entity,
                  ),
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
      draftEntitiesWithLinkedDataSubgraph,
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
              ? "You have no drafts currently awaiting review."
              : "No draft entities match the selected filters."}
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
              draftEntitiesWithLinkedDataSubgraph ? (
                <>
                  {displayedDraftEntitiesWithCreatedAt.map(
                    ({ entity }, i, all) => {
                      const isSelected = selectedDraftEntityIds.includes(
                        entity.metadata.recordId.entityId,
                      );
                      return (
                        <Fragment key={entity.metadata.recordId.entityId}>
                          <DraftEntity
                            entity={entity}
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
          draftEntitiesWithCreators={draftEntitiesWithCreators}
          draftEntitiesSubgraph={draftEntitiesWithLinkedDataSubgraph}
          filterState={filterState}
          setFilterState={handleFilterStateChange}
        />
      )}
    </Container>
  );
};
