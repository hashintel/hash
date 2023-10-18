import { IconButton } from "@hashintel/design-system";
import { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse, Divider } from "@mui/material";
import { Fragment, FunctionComponent, useState } from "react";

import { ArrowsFromLineRegularIcon } from "../../shared/icons/arrows-from-line-regular-icon";
import { ArrowsToLineRegularIcon } from "../../shared/icons/arrows-to-line-regular-icon";
import { EditableQuickNote } from "./editable-quick-note";
import { NotesSectionWrapper } from "./notes-section-wrapper";
import { NotesWrapper } from "./notes-wrapper";
import { TimestampCollectionHeading } from "./timestamp-collection-heading";
import { TimestampCollectionSubheading } from "./timestamp-collection-subheading";
import { TimestampColumnWrapper } from "./timestamp-column-wrapper";
import { QuickNoteEntityWithCreatedAt } from "./types";

export const NotesSection: FunctionComponent<{
  dayTimestamp: string;
  heading?: string;
  quickNoteEntities: QuickNoteEntityWithCreatedAt[];
  quickNotesSubgraph?: Subgraph<EntityRootType>;
  refetchQuickNotes: () => Promise<void>;
}> = ({
  dayTimestamp,
  heading,
  quickNoteEntities,
  quickNotesSubgraph,
  refetchQuickNotes,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <NotesSectionWrapper>
      <TimestampColumnWrapper>
        {heading ? (
          <TimestampCollectionHeading>{heading}</TimestampCollectionHeading>
        ) : null}
        <TimestampCollectionSubheading>
          {dayTimestamp}
        </TimestampCollectionSubheading>
        <Box display="flex" marginRight={-1}>
          <IconButton onClick={() => setIsCollapsed(!isCollapsed)}>
            {isCollapsed ? (
              <ArrowsFromLineRegularIcon />
            ) : (
              <ArrowsToLineRegularIcon />
            )}
          </IconButton>
        </Box>
      </TimestampColumnWrapper>
      <Box flexGrow={1}>
        <Collapse in={!isCollapsed}>
          {quickNoteEntities.length > 0 ? (
            <NotesWrapper sx={{ padding: 0 }}>
              {quickNoteEntities.map((quickNoteEntityWithCreatedAt, index) => (
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
                      quickNoteSubgraph={quickNotesSubgraph}
                      refetchQuickNotes={refetchQuickNotes}
                    />
                  </Box>
                </Fragment>
              ))}
            </NotesWrapper>
          ) : null}
        </Collapse>
      </Box>
    </NotesSectionWrapper>
  );
};
