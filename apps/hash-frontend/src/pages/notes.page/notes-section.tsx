import { IconButton } from "@hashintel/design-system";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse } from "@mui/material";
import { FunctionComponent, useState } from "react";

import { ArrowsFromLineRegularIcon } from "../../shared/icons/arrows-from-line-regular-icon";
import { ArrowsToLineRegularIcon } from "../../shared/icons/arrows-to-line-regular-icon";
import { EditableQuickNote } from "./editable-quick-note";
import { NotesSectionWrapper } from "./notes-section-wrapper";
import { NotesWrapper } from "./notes-wrapper";
import { TimestampCollectionSubheading } from "./timestamp-collection-subheading";
import { TimestampColumnWrapper } from "./timestamp-column-wrapper";

export const NotesSection: FunctionComponent<{
  dayTimestamp: string;
  quickNoteEntities: Entity[];
  quickNotesSubgraph?: Subgraph<EntityRootType>;
  refetchQuickNotes: () => Promise<void>;
}> = ({
  dayTimestamp,
  quickNoteEntities,
  quickNotesSubgraph,
  refetchQuickNotes,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <NotesSectionWrapper>
      <TimestampColumnWrapper>
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
            <NotesWrapper>
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
        </Collapse>
      </Box>
    </NotesSectionWrapper>
  );
};
