import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
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
import { useCallback, useMemo, useRef } from "react";

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
import { TopContextBar } from "./shared/top-context-bar";

const NotesPage: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  const sectionRefs = useRef<Array<HTMLDivElement>>([]);

  const { data: quickNotesAllVersionsData, refetch } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      query: {
        filter: {
          all: [
            generateVersionedUrlMatchingFilter(
              types.entityType.quickNote.entityTypeId,
            ),
            {
              equal: [
                { path: ["ownedById"] },
                { parameter: authenticatedUser.accountId },
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
    fetchPolicy: "cache-and-network",
  });

  const quickNotesAllVersionsSubgraph =
    quickNotesAllVersionsData?.structuralQueryEntities as
      | Subgraph<EntityRootType>
      | undefined;

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

    return latestQuickNoteEntities
      .filter(
        ({ properties }) =>
          !properties[
            extractBaseUrl(types.propertyType.archived.propertyTypeId)
          ],
      )
      .map((quickNoteEntity) => ({
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

  const { data: quickNotesWithContentsData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
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
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          hasLeftEntity: { incoming: 2, outgoing: 2 },
          hasRightEntity: { incoming: 2, outgoing: 2 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    fetchPolicy: "cache-and-network",
    skip:
      !latestQuickNoteEntitiesWithCreatedAt ||
      latestQuickNoteEntitiesWithCreatedAt.length === 0,
  });

  const quickNotesWithContentsSubgraph =
    quickNotesWithContentsData?.structuralQueryEntities as
      | Subgraph<EntityRootType>
      | undefined;

  const todayTimestamp = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const quickNotesEntitiesCreatedToday = useMemo(
    () => latestQuickNoteEntitiesByDay?.[todayTimestamp],
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
            <TodaySection
              ref={(element) => {
                if (element) {
                  sectionRefs.current[0] = element;
                }
              }}
              quickNoteEntities={quickNotesEntitiesCreatedToday}
              quickNotesSubgraph={quickNotesWithContentsSubgraph}
              refetchQuickNotes={refetchQuickNotes}
              navigateDown={() => {
                sectionRefs.current[1]?.scrollIntoView({
                  behavior: "smooth",
                });
              }}
            />
            {latestQuickNoteEntitiesByDay
              ? Object.entries(latestQuickNoteEntitiesByDay)
                  .filter(([dayTimestamp]) => dayTimestamp !== todayTimestamp)
                  .map(
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
