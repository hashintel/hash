import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse, Divider } from "@mui/material";
import { format } from "date-fns";
import { forwardRef, Fragment, useMemo, useState } from "react";

import {
  getBlockCollectionContents,
  isBlockCollectionContentsEmpty,
} from "../../lib/block-collection";
import { CreateQuickNote } from "./create-quick-note";
import { EditableQuickNote } from "./editable-quick-note";
import { NotesSectionWrapper } from "./notes-section-wrapper";
import { NotesWrapper } from "./notes-wrapper";
import { TimestampColumn } from "./timestamp-column";
import { QuickNoteEntityWithCreatedAt } from "./types";

// const CreateChip = styled(Chip)(({ theme }) => ({
//   background: theme.palette.common.white,
//   color: theme.palette.common.black,
//   "&:hover": {
//     color: theme.palette.common.black,
//   },
// }));

export const TodaySection = forwardRef<
  HTMLDivElement,
  {
    quickNoteEntities?: QuickNoteEntityWithCreatedAt[];
    quickNotesSubgraph?: Subgraph<EntityRootType> | null;
    refetchQuickNotes: () => Promise<void>;
    navigateDown?: () => void;
  }
>(
  (
    { quickNoteEntities, quickNotesSubgraph, refetchQuickNotes, navigateDown },
    ref,
  ) => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [creatingQuickNote, setCreatingQuickNote] = useState<Entity>();

    const latestQuickNoteEntityWithEmptyContents = useMemo(() => {
      if (!quickNoteEntities || typeof quickNotesSubgraph === "undefined") {
        return undefined;
      }

      const { quickNoteEntity: latestQuickNoteEntity } =
        quickNoteEntities[0] ?? {};

      if (!latestQuickNoteEntity || !quickNotesSubgraph) {
        return null;
      }

      const contents = getBlockCollectionContents({
        blockCollectionEntityId:
          latestQuickNoteEntity.metadata.recordId.entityId,
        blockCollectionSubgraph: quickNotesSubgraph,
      });

      if (isBlockCollectionContentsEmpty({ contents })) {
        return latestQuickNoteEntity;
      }
      return null;
    }, [quickNoteEntities, quickNotesSubgraph]);

    const displayedQuickNoteEntities = useMemo(
      () =>
        quickNoteEntities?.filter(
          ({ quickNoteEntity }) =>
            (!creatingQuickNote ||
              quickNoteEntity.metadata.recordId.entityId !==
                creatingQuickNote.metadata.recordId.entityId) &&
            (!latestQuickNoteEntityWithEmptyContents ||
              latestQuickNoteEntityWithEmptyContents.metadata.recordId
                .entityId !== quickNoteEntity.metadata.recordId.entityId),
        ),
      [
        quickNoteEntities,
        creatingQuickNote,
        latestQuickNoteEntityWithEmptyContents,
      ],
    );

    return (
      <NotesSectionWrapper ref={ref}>
        <TimestampColumn
          heading="Today"
          subheading={format(new Date(), "yyyy-MM-dd")}
          isCollapsed={isCollapsed}
          toggleIsCollapsed={() => setIsCollapsed(!isCollapsed)}
          navigateDown={navigateDown}
        />
        <Box flexGrow={1}>
          <NotesWrapper sx={{ padding: ({ spacing }) => spacing(3.25, 4.5) }}>
            {/* 
            If the last created quick note is empty, we re-use it to populate the
            create quick note form. This prevents the quick notes page from creating
            a new quick note on every page load.

            @todo: when we have draft entities, we could use a draft quick note to
            populate this input instead. Alternatively, we could refactor the
            `BlockCollection` component to support rendering the input without
            a block collection entity having been persisted yet.
            */}
            <CreateQuickNote
              initialQuickNoteEntity={latestQuickNoteEntityWithEmptyContents}
              initialQuickNoteEntitySubgraph={
                latestQuickNoteEntityWithEmptyContents && quickNotesSubgraph
                  ? quickNotesSubgraph
                  : undefined
              }
              refetchQuickNotes={refetchQuickNotes}
              onCreatingQuickNote={setCreatingQuickNote}
            />
            {/* @todo: add these chips when they do something specific to the note */}
            {/* <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
            <Box display="flex" marginTop={2.25}>
              <Box display="flex" alignItems="center" gap={1.5}>
                <Typography
                  sx={{
                    color: ({ palette }) => palette.gray[90],
                    fontSize: 12,
                    fontWeight: 600,
                    textTransform: "uppercase",
                  }}
                >
                  Create new
                </Typography>
                <CreateChip
                  variant="outlined"
                  href="/new/entity"
                  component="a"
                  label="Entity"
                  clickable
                />
                <CreateChip
                  variant="outlined"
                  href="/new/types/entity-type"
                  component="a"
                  label="Type"
                  clickable
                />
              </Box>
            </Box> */}
          </NotesWrapper>
          <Collapse in={!isCollapsed}>
            {displayedQuickNoteEntities &&
            displayedQuickNoteEntities.length > 0 ? (
              <NotesWrapper marginTop={3}>
                {displayedQuickNoteEntities.map(
                  (quickNoteEntityWithCreatedAt, index) => (
                    <Fragment
                      key={
                        quickNoteEntityWithCreatedAt.quickNoteEntity.metadata
                          .recordId.entityId
                      }
                    >
                      {index !== 0 ? (
                        <Divider
                          sx={{
                            backgroundColor: ({ palette }) => palette.gray[30],
                          }}
                        />
                      ) : null}
                      <Box paddingY={3.25} paddingX={4.5}>
                        <EditableQuickNote
                          quickNoteEntityWithCreatedAt={
                            quickNoteEntityWithCreatedAt
                          }
                          quickNoteSubgraph={quickNotesSubgraph ?? undefined}
                          refetchQuickNotes={refetchQuickNotes}
                        />
                      </Box>
                    </Fragment>
                  ),
                )}
              </NotesWrapper>
            ) : null}
          </Collapse>
        </Box>
      </NotesSectionWrapper>
    );
  },
);
