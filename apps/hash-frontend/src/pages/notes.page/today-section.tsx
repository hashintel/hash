import { Chip } from "@hashintel/design-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Divider, Typography } from "@mui/material";
import { styled } from "@mui/system";
import { format } from "date-fns";
import { FunctionComponent } from "react";

import { CreateQuickNote } from "./create-quick-note";
import { EditableQuickNote } from "./editable-quick-note";
import { NotesSectionWrapper } from "./notes-section-wrapper";
import { NotesWrapper } from "./notes-wrapper";
import { TimestampCollectionHeading } from "./timestamp-collection-heading";
import { TimestampCollectionSubheading } from "./timestamp-collection-subheading";
import { TimestampColumnWrapper } from "./timestamp-column-wrapper";

const CreateChip = styled(Chip)(({ theme }) => ({
  background: theme.palette.common.white,
  color: theme.palette.common.black,
  "&:hover": {
    color: theme.palette.common.black,
  },
}));

export const TodaySection: FunctionComponent<{
  quickNoteEntities?: Entity[];
  quickNotesSubgraph?: Subgraph<EntityRootType>;
  refetchQuickNotes: () => Promise<void>;
}> = ({ quickNoteEntities, quickNotesSubgraph, refetchQuickNotes }) => (
  <NotesSectionWrapper>
    <TimestampColumnWrapper>
      <TimestampCollectionHeading>Today</TimestampCollectionHeading>
      <TimestampCollectionSubheading>
        {format(new Date(), "yyyy-MM-dd")}
      </TimestampCollectionSubheading>
    </TimestampColumnWrapper>
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
      {quickNoteEntities && quickNoteEntities.length > 0 ? (
        <NotesWrapper marginTop={3}>
          {quickNoteEntities.map((quickNoteEntity) => (
            <Box key={quickNoteEntity.metadata.recordId.entityId}>
              <EditableQuickNote
                quickNoteEntity={quickNoteEntity}
                quickNoteSubgraph={quickNotesSubgraph}
                refetchQuickNotes={refetchQuickNotes}
              />
            </Box>
          ))}
        </NotesWrapper>
      ) : null}
    </Box>
  </NotesSectionWrapper>
);
