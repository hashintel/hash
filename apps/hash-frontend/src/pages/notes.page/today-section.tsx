import { Chip } from "@hashintel/design-system";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse, Divider, Typography } from "@mui/material";
import { styled } from "@mui/system";
import { format } from "date-fns";
import { forwardRef, useState } from "react";

import { CreateQuickNote } from "./create-quick-note";
import { EditableQuickNote } from "./editable-quick-note";
import { NotesSectionWrapper } from "./notes-section-wrapper";
import { NotesWrapper } from "./notes-wrapper";
import { TimestampColumn } from "./timestamp-column";
import { QuickNoteEntityWithCreatedAt } from "./types";

const CreateChip = styled(Chip)(({ theme }) => ({
  background: theme.palette.common.white,
  color: theme.palette.common.black,
  "&:hover": {
    color: theme.palette.common.black,
  },
}));

export const TodaySection = forwardRef<
  HTMLDivElement,
  {
    quickNoteEntities?: QuickNoteEntityWithCreatedAt[];
    quickNotesSubgraph?: Subgraph<EntityRootType>;
    refetchQuickNotes: () => Promise<void>;
    navigateDown: () => void;
  }
>(
  (
    { quickNoteEntities, quickNotesSubgraph, refetchQuickNotes, navigateDown },
    ref,
  ) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

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
          <NotesWrapper>
            <CreateQuickNote />
            <Divider sx={{ borderColor: ({ palette }) => palette.gray[20] }} />
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
            </Box>
          </NotesWrapper>
          <Collapse in={!isCollapsed}>
            {quickNoteEntities && quickNoteEntities.length > 0 ? (
              <NotesWrapper marginTop={3}>
                {quickNoteEntities.map((quickNoteEntityWithCreatedAt) => (
                  <Box
                    key={
                      quickNoteEntityWithCreatedAt.quickNoteEntity.metadata
                        .recordId.entityId
                    }
                  >
                    <EditableQuickNote
                      quickNoteEntityWithCreatedAt={
                        quickNoteEntityWithCreatedAt
                      }
                      quickNoteSubgraph={quickNotesSubgraph}
                      refetchQuickNotes={refetchQuickNotes}
                    />
                  </Box>
                ))}
              </NotesWrapper>
            ) : null}
          </Collapse>
        </Box>
      </NotesSectionWrapper>
    );
  },
);
