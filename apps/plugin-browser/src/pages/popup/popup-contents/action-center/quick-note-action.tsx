import { Button } from "@hashintel/design-system";
import { Subgraph } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import { useState } from "react";

import { queryApi } from "../../../shared/query-api";
import { Action } from "./action";
import { QuickNoteIcon } from "./quick-note-action/quick-note-icon";
import { TextFieldWithDarkMode } from "./text-field-with-dark-mode";

const createEntityQuery = /* GraphQL */ `
  mutation createEntity(
    $entityTypeId: VersionedUrl!
    $properties: EntityPropertiesObject!
  ) {
    createEntity(entityTypeId: $entityTypeId, properties: $properties)
  }
`;

const createQuickNote = (text: string) => {
  return queryApi(createEntityQuery, {
    entityTypeId:
      "https://app.hash.ai/@ciaran/types/entity-type/quick-note/v/1",
    properties: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
        text,
    },
  }).then(({ data }: { data: { createEntity: Subgraph } }) => {
    return data.createEntity;
  });
};

export const QuickNoteAction = () => {
  const [draftQuickNote, setDraftQuickNote] = useState("");

  const saveQuickNote = () => {
    void createQuickNote(draftQuickNote).then(() => {
      setDraftQuickNote("");
    });
  };

  return (
    <Action
      HeaderIcon={QuickNoteIcon}
      headerText="Quick note"
      linkHref="https://app.hash.ai/@ciaran/types/entity-type/quick-note?tab=entities"
      linkText="View notes"
    >
      <Box
        component="form"
        onSubmit={(event) => {
          event.preventDefault();
          saveQuickNote();
        }}
      >
        <TextFieldWithDarkMode
          multiline
          placeholder="Start typing here..."
          minRows={1}
          value={draftQuickNote}
          onChange={(event) => setDraftQuickNote(event.target.value)}
          sx={{ mb: 1.5, width: "100%" }}
        />
        <Button disabled={!draftQuickNote} size="small" type="submit">
          Save quick note
        </Button>
      </Box>
    </Action>
  );
};
