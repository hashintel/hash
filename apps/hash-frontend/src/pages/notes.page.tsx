import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
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
import type {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { NoteIcon } from "../shared/icons/note-icon";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { NotesSection } from "./notes.page/notes-section";
import { TodaySection } from "./notes.page/today-section";
import { useAuthenticatedUser } from "./shared/auth-info-context";
import { blockCollectionContentsDepths } from "./shared/block-collection-contents";
import { BlockCollectionContextProvider } from "./shared/block-collection-context";
import { TopContextBar } from "./shared/top-context-bar";

const NotesPage: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  const sectionRefs = useRef<Array<HTMLDivElement>>([]);

  const [previouslyFetchedQuickNotesData, setPreviouslyFetchedQuickNotesData] =
    useState<StructuralQueryEntitiesQuery>();

  const { data: quickNotesData, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: true,
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.quickNote.entityTypeId,
              { ignoreParents: true },
            ),
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser.accountId },
              ],
            },
          ],
        },
        graphResolveDepths: blockCollectionContentsDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
      },
    },
    onCompleted: (data) => setPreviouslyFetchedQuickNotesData(data),
    fetchPolicy: "cache-and-network",
  });

  const quickNotesSubgraph = (quickNotesData ?? previouslyFetchedQuickNotesData)
    ?.structuralQueryEntities.subgraph as Subgraph<EntityRootType> | undefined;

  const latestQuickNoteEntities = useMemo<Entity[] | undefined>(() => {
    if (!quickNotesSubgraph) {
      return undefined;
    }

    return getRoots(quickNotesSubgraph);
  }, [quickNotesSubgraph]);

  const latestQuickNoteEntitiesByDay = useMemo(
    () =>
      latestQuickNoteEntities
        ?.sort((a, b) => {
          const aCreatedAt = new Date(
            a.metadata.provenance.createdAtDecisionTime,
          );
          const bCreatedAt = new Date(
            b.metadata.provenance.createdAtDecisionTime,
          );

          return bCreatedAt.getTime() - aCreatedAt.getTime();
        })
        .reduce<Record<string, Entity[]>>((acc, quickNoteEntity) => {
          const createdAt = new Date(
            quickNoteEntity.metadata.provenance.createdAtDecisionTime,
          );

          const key = format(createdAt, "yyyy-MM-dd");

          acc[key] = [...(acc[key] ?? []), quickNoteEntity];

          return acc;
        }, {}),
    [latestQuickNoteEntities],
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
      } else if (
        differenceInMonths(today, currentDate) >= 12 &&
        !existingHeadings.includes("Over a year ago")
      ) {
        updated[key] = "Over a year ago";
      }

      return updated;
    }, {});
  }, [latestQuickNoteEntitiesByDay]);

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
            icon: <NoteIcon />,
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
              blockCollectionSubgraph={quickNotesSubgraph}
              userPermissionsOnEntities={
                quickNotesData?.structuralQueryEntities
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
                    : quickNotesSubgraph
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
                    ([dayTimestamp, quickNoteEntities], index, all) => (
                      <NotesSection
                        key={dayTimestamp}
                        ref={(element) => {
                          if (element) {
                            sectionRefs.current[index + 1] = element;
                          }
                        }}
                        dayTimestamp={dayTimestamp}
                        heading={dayTimestampToHeadings?.[dayTimestamp]}
                        quickNoteEntities={quickNoteEntities}
                        quickNotesSubgraph={quickNotesSubgraph}
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
