import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { Box, Collapse, Divider } from "@mui/material";
import { forwardRef, Fragment, useState } from "react";

import { EditableQuickNote } from "./editable-quick-note";
import { NotesSectionWrapper } from "./notes-section-wrapper";
import { NotesWrapper } from "./notes-wrapper";
import { TimestampColumn } from "./timestamp-column";

export const NotesSection = forwardRef<
  HTMLDivElement,
  {
    dayTimestamp: string;
    heading?: string;
    quickNoteEntities: Entity[];
    quickNotesSubgraph?: Subgraph<EntityRootType>;
    refetchQuickNotes: () => Promise<void>;
    navigateUp?: () => void;
    navigateDown?: () => void;
  }
>(
  (
    {
      dayTimestamp,
      heading,
      quickNoteEntities,
      quickNotesSubgraph,
      refetchQuickNotes,
      navigateUp,
      navigateDown,
    },
    ref,
  ) => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
      <NotesSectionWrapper ref={ref}>
        <TimestampColumn
          heading={heading}
          subheading={dayTimestamp}
          isCollapsed={isCollapsed}
          toggleIsCollapsed={() => setIsCollapsed(!isCollapsed)}
          navigateUp={navigateUp}
          navigateDown={navigateDown}
        />
        <Box flexGrow={1}>
          <Collapse in={!isCollapsed}>
            {quickNoteEntities.length > 0 ? (
              <NotesWrapper>
                {quickNoteEntities.map((quickNoteEntity, index) => (
                  <Fragment key={quickNoteEntity.metadata.recordId.entityId}>
                    {index !== 0 ? (
                      <Divider
                        sx={{
                          backgroundColor: ({ palette }) => palette.gray[30],
                        }}
                      />
                    ) : null}
                    <Box paddingY={3.25} paddingX={4.5}>
                      <EditableQuickNote
                        quickNoteEntity={quickNoteEntity}
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
  },
);
