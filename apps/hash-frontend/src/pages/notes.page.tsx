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
import { Container } from "@mui/material";
import { format } from "date-fns";
import { useCallback, useMemo } from "react";

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
import { useAuthenticatedUser } from "./shared/auth-info-context";
import { TopContextBar } from "./shared/top-context-bar";

type QuickNoteEntityWithCreatedAt = {
  quickNoteEntity: Entity;
  createdAt: Date;
};

const NotesPage: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthenticatedUser();

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
      latestQuickNoteEntitiesWithCreatedAt?.reduce<
        Record<string, QuickNoteEntityWithCreatedAt[]>
      >((acc, quickNoteEntityWithCreatedAt) => {
        const key = format(
          quickNoteEntityWithCreatedAt.createdAt,
          "yyyy-MM-dd",
        ); // Format date to "YYYY-MM-DD" in local time

        acc[key] = [...(acc[key] ?? []), quickNoteEntityWithCreatedAt];

        return acc;
      }, {}),
    [latestQuickNoteEntitiesWithCreatedAt],
  );

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

  const quickNotesEntitiesCreatedToday = useMemo(
    () =>
      latestQuickNoteEntitiesByDay?.[format(new Date(), "yyyy-MM-dd")]?.map(
        ({ quickNoteEntity }) => quickNoteEntity,
      ),
    [latestQuickNoteEntitiesByDay],
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
              quickNoteEntities={quickNotesEntitiesCreatedToday}
              quickNotesSubgraph={quickNotesWithContentsSubgraph}
              refetchQuickNotes={refetchQuickNotes}
            />
            {latestQuickNoteEntitiesByDay
              ? Object.entries(latestQuickNoteEntitiesByDay).map(
                  ([dayTimestamp, quickNoteEntitiesWithCreatedAt]) => (
                    <NotesSection
                      key={dayTimestamp}
                      dayTimestamp={dayTimestamp}
                      quickNoteEntities={quickNoteEntitiesWithCreatedAt.map(
                        ({ quickNoteEntity }) => quickNoteEntity,
                      )}
                      quickNotesSubgraph={quickNotesWithContentsSubgraph}
                      refetchQuickNotes={refetchQuickNotes}
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
