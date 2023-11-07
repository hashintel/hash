import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { Container } from "@mui/material";
import {
  differenceInDays,
  differenceInMonths,
  differenceInWeeks,
  format,
  isYesterday,
} from "date-fns";
import { useCallback, useMemo, useRef, useState } from "react";

import { BlockLoadedProvider } from "../blocks/on-block-loaded";
import { UserBlocksProvider } from "../blocks/user-blocks";
import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { getFirstRevisionCreatedAt } from "../shared/entity-utils";
import { QuickNoteIcon } from "../shared/icons/quick-note-icon";
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { NotesSection } from "./notes.page/notes-section";
import { TodaySection } from "./notes.page/today-section";
import { QuickNoteEntityWithCreatedAt } from "./notes.page/types";
import { useAuthenticatedUser } from "./shared/auth-info-context";
import { blockCollectionContentsDepths } from "./shared/block-collection-contents";
import { BlockCollectionContextProvider } from "./shared/block-collection-context";
import { TopContextBar } from "./shared/top-context-bar";

const NotesPage: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  const sectionRefs = useRef<Array<HTMLDivElement>>([]);

  const [
    previouslyFetchedQuickNotesAllVersionsData,
    setPreviouslyFetchedQuickNotesAllVersionsData,
  ] = useState<StructuralQueryEntitiesQuery>();

  const { data: quickNotesAllVersionsData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemTypes.entityType.quickNote.entityTypeId,
            ),
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser.accountId },
              ],
            },
            {
              any: [
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          systemTypes.propertyType.archived.propertyTypeId,
                        ),
                      ],
                    },
                    // @ts-expect-error -- We need to update the type definition of `EntityStructuralQuery` to allow for this
                    //   @see https://linear.app/hash/issue/H-1207
                    null,
                  ],
                },
                {
                  equal: [
                    {
                      path: [
                        "properties",
                        extractBaseUrl(
                          systemTypes.propertyType.archived.propertyTypeId,
                        ),
                      ],
                    },
                    { parameter: false },
                  ],
                },
              ],
            },
          ],
        },
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          isOfType: { outgoing: 1 },
        },
        /**
         * We need to obtain all revisions of the quick note entities
         * to determine when they were created.
         */
        temporalAxes: {
          pinned: { axis: "transactionTime", timestamp: null },
          variable: {
            axis: "decisionTime",
            interval: { start: { kind: "unbounded" }, end: null },
          },
        },
      },
    },
    onCompleted: (data) => setPreviouslyFetchedQuickNotesAllVersionsData(data),
    fetchPolicy: "cache-and-network",
  });

  const quickNotesAllVersionsSubgraph = (
    quickNotesAllVersionsData ?? previouslyFetchedQuickNotesAllVersionsData
  )?.structuralQueryEntities.subgraph as Subgraph<EntityRootType> | undefined;

  const latestQuickNoteEntitiesWithCreatedAt = useMemo<
    QuickNoteEntityWithCreatedAt[] | undefined
  >(() => {
    if (!quickNotesAllVersionsSubgraph) {
      return undefined;
    }
    const latestQuickNoteEntities = getRoots(
      quickNotesAllVersionsSubgraph,
    ).reduce<Entity[]>((prev, current) => {
      const previousEntityIndex = prev.findIndex(
        (entity) =>
          entity.metadata.recordId.entityId ===
          current.metadata.recordId.entityId,
      );

      const previousEntity = prev[previousEntityIndex];

      if (!previousEntity) {
        return [...prev, current];
      }

      const updatedPrev = [...prev];

      if (
        previousEntity.metadata.temporalVersioning.decisionTime.start.limit <
        current.metadata.temporalVersioning.decisionTime.start.limit
      ) {
        updatedPrev[previousEntityIndex] = current;
      }
      return updatedPrev;
    }, []);

    return latestQuickNoteEntities.map((quickNoteEntity) => ({
      quickNoteEntity,
      createdAt: getFirstRevisionCreatedAt(
        quickNotesAllVersionsSubgraph,
        quickNoteEntity.metadata.recordId.entityId,
      ),
    }));
  }, [quickNotesAllVersionsSubgraph]);

  const latestQuickNoteEntitiesByDay = useMemo(
    () =>
      latestQuickNoteEntitiesWithCreatedAt
        ?.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .reduce<Record<string, QuickNoteEntityWithCreatedAt[]>>(
          (acc, quickNoteEntityWithCreatedAt) => {
            const key = format(
              quickNoteEntityWithCreatedAt.createdAt,
              "yyyy-MM-dd",
            );

            acc[key] = [...(acc[key] ?? []), quickNoteEntityWithCreatedAt];

            return acc;
          },
          {},
        ),
    [latestQuickNoteEntitiesWithCreatedAt],
  );

  const dayTimestampToHeadings = useMemo(() => {
    if (!latestQuickNoteEntitiesByDay) {
      return;
    }
    const sortedDates = Object.keys(latestQuickNoteEntitiesByDay)
      .map((timestamp) => new Date(timestamp))
      .sort((a, b) => b.getTime() - a.getTime());

    const today = new Date();

    return sortedDates.reduce<Record<string, string>>((prev, currentDate) => {
      const key = format(currentDate, "yyyy-MM-dd");

      const updated = { ...prev };

      const existingHeadings = Object.values(updated);

      if (isYesterday(currentDate)) {
        updated[key] = "Yesterday";
      } else if (differenceInDays(today, currentDate) < 7) {
        updated[key] = format(currentDate, "EEEE");
      } else if (differenceInDays(today, currentDate) === 7) {
        updated[key] = `Last ${format(currentDate, "EEEE")}`;
      } else if (
        differenceInDays(today, currentDate) < 14 &&
        !existingHeadings.includes("Over a week ago")
      ) {
        updated[key] = "Over a week ago";
      } else if (
        differenceInWeeks(today, currentDate) < 4 &&
        !existingHeadings.includes("Over 2 weeks ago")
      ) {
        updated[key] = "Over 2 weeks ago";
      } else if (
        differenceInMonths(today, currentDate) < 12 &&
        !existingHeadings.includes("Over a month ago")
      ) {
        updated[key] = "Over a month ago";
      } else if (!existingHeadings.includes("Over a year ago")) {
        updated[key] = "Over a year ago";
      }

      return updated;
    }, {});
  }, [latestQuickNoteEntitiesByDay]);

  const [
    previouslyFetchedQuickNotesWithContentsData,
    setPreviouslyFetchedQuickNotesWithContentsData,
  ] = useState<StructuralQueryEntitiesQuery>();

  const { data: quickNotesWithContentsData, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: true,
      query: {
        filter: {
          any: (latestQuickNoteEntitiesWithCreatedAt ?? []).map(
            ({ quickNoteEntity }) => ({
              equal: [
                { path: ["uuid"] },
                {
                  parameter: extractEntityUuidFromEntityId(
                    quickNoteEntity.metadata.recordId.entityId,
                  ),
                },
              ],
            }),
          ),
        },
        graphResolveDepths: blockCollectionContentsDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    fetchPolicy: "cache-and-network",
    onCompleted: (data) => setPreviouslyFetchedQuickNotesWithContentsData(data),
    skip:
      !latestQuickNoteEntitiesWithCreatedAt ||
      latestQuickNoteEntitiesWithCreatedAt.length === 0,
  });

  const quickNotesWithContentsSubgraph = (
    quickNotesWithContentsData ?? previouslyFetchedQuickNotesWithContentsData
  )?.structuralQueryEntities.subgraph as Subgraph<EntityRootType> | undefined;

  const todayTimestamp = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const quickNotesEntitiesCreatedToday = useMemo(
    () =>
      latestQuickNoteEntitiesByDay
        ? latestQuickNoteEntitiesByDay[todayTimestamp] ?? []
        : undefined,
    [latestQuickNoteEntitiesByDay, todayTimestamp],
  );

  const quickNotesEntitiesCreatedBeforeToday = useMemo(
    () =>
      latestQuickNoteEntitiesByDay
        ? Object.entries(latestQuickNoteEntitiesByDay).filter(
            ([dayTimestamp]) => dayTimestamp !== todayTimestamp,
          )
        : undefined,
    [latestQuickNoteEntitiesByDay, todayTimestamp],
  );

  const refetchQuickNotes = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <>
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Notes",
            href: "/notes",
            id: "notes",
            icon: <QuickNoteIcon />,
          },
        ]}
        sx={{
          background: "transparent",
        }}
      />
      <Container>
        <BlockLoadedProvider>
          <UserBlocksProvider value={{}}>
            <BlockCollectionContextProvider
              blockCollectionSubgraph={quickNotesWithContentsSubgraph}
              userPermissionsOnEntities={
                quickNotesWithContentsData?.structuralQueryEntities
                  .userPermissionsOnEntities
              }
            >
              <TodaySection
                ref={(element) => {
                  if (element) {
                    sectionRefs.current[0] = element;
                  }
                }}
                quickNoteEntities={quickNotesEntitiesCreatedToday}
                quickNotesSubgraph={
                  quickNotesEntitiesCreatedToday &&
                  quickNotesEntitiesCreatedToday.length === 0
                    ? null
                    : quickNotesWithContentsSubgraph
                }
                refetchQuickNotes={refetchQuickNotes}
                navigateDown={
                  quickNotesEntitiesCreatedBeforeToday &&
                  quickNotesEntitiesCreatedBeforeToday.length > 0
                    ? () => {
                        sectionRefs.current[1]?.scrollIntoView({
                          behavior: "smooth",
                        });
                      }
                    : undefined
                }
              />
              {quickNotesEntitiesCreatedBeforeToday
                ? quickNotesEntitiesCreatedBeforeToday.map(
                    (
                      [dayTimestamp, quickNoteEntitiesWithCreatedAt],
                      index,
                      all,
                    ) => (
                      <NotesSection
                        key={dayTimestamp}
                        ref={(element) => {
                          if (element) {
                            sectionRefs.current[index + 1] = element;
                          }
                        }}
                        dayTimestamp={dayTimestamp}
                        heading={dayTimestampToHeadings?.[dayTimestamp]}
                        quickNoteEntities={quickNoteEntitiesWithCreatedAt}
                        quickNotesSubgraph={quickNotesWithContentsSubgraph}
                        refetchQuickNotes={refetchQuickNotes}
                        navigateUp={() => {
                          sectionRefs.current[index]?.scrollIntoView({
                            behavior: "smooth",
                          });
                        }}
                        navigateDown={
                          index < all.length - 1
                            ? () => {
                                sectionRefs.current[index + 2]?.scrollIntoView({
                                  behavior: "smooth",
                                });
                              }
                            : undefined
                        }
                      />
                    ),
                  )
                : null}
            </BlockCollectionContextProvider>
          </UserBlocksProvider>
        </BlockLoadedProvider>
      </Container>
    </>
  );
};

NotesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default NotesPage;
