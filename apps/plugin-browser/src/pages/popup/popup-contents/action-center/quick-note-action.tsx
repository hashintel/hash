import { extractBaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import { Button } from "@hashintel/design-system";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import { TextToken } from "@local/hash-isomorphic-utils/types";
import { Entity, EntityPropertiesObject, LinkData } from "@local/hash-subgraph";
import { Box } from "@mui/material";

import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createEntityMutation } from "../../../../graphql/queries/entity.queries";
import { queryApi } from "../../../../shared/query-api";
import { useSessionStorage } from "../../../shared/use-storage-sync";
import { Action } from "./action";
import { QuickNoteIcon } from "./quick-note-action/quick-note-icon";
import { TextFieldWithDarkMode } from "./text-field-with-dark-mode";

const quickNoteEntityTypeId =
  "https://hash.ai/@hash/types/entity-type/quick-note/v/1" as const;

const containsLinkEntityTypeId =
  "https://hash.ai/@hash/types/entity-type/contains/v/1" as const;

const numericIndexPropertyTypeId =
  "https://hash.ai/@hash/types/property-type/numeric-index/v/1" as const;

const blockEntityTypeId =
  "https://hash.ai/@hash/types/entity-type/block/v/1" as const;

const componentIdPropertyTypeId =
  "https://hash.ai/@hash/types/property-type/component-id/v/1" as const;

const blockDataLinkEntityTypeId =
  "https://hash.ai/@hash/types/entity-type/block-data/v/1" as const;

const textEntityTypeId =
  "https://hash.ai/@hash/types/entity-type/text/v/1" as const;

const textualContentPropertyTypeId =
  "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/v/2" as const;

const createEntity = (params: {
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
}): Promise<Entity> =>
  queryApi<CreateEntityMutation, CreateEntityMutationVariables>(
    createEntityMutation,
    {
      entityTypeId: params.entityTypeId,
      properties: params.properties,
      linkData: params.linkData,
    },
  ).then(({ data }) => {
    return data.createEntity;
  });

const createQuickNote = async (text: string) => {
  const paragraphs = text
    // Normalize line endings (optional, in case input comes with different OS-specific newlines)
    .replace(/\r\n/g, "\n")
    // Split the input by one or more newlines to identify paragraphs
    .split(/\n+/)
    // Trim whitespace from each paragraph and filter out any empty strings that might result from excessive newlines

    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const [quickNoteEntity, ...blockEntities] = await Promise.all([
    createEntity({
      entityTypeId: quickNoteEntityTypeId,
      properties: {},
    }),
    ...paragraphs.map(async (paragraph) => {
      const [textEntity, blockEntity] = await Promise.all([
        createEntity({
          entityTypeId: textEntityTypeId,
          properties: {
            [extractBaseUrl(textualContentPropertyTypeId)]: [
              { tokenType: "text", text: paragraph },
            ] satisfies TextToken[],
          },
        }),
        createEntity({
          entityTypeId: blockEntityTypeId,
          properties: {
            [extractBaseUrl(componentIdPropertyTypeId)]:
              paragraphBlockComponentId,
          },
        }),
      ]);

      await createEntity({
        entityTypeId: blockDataLinkEntityTypeId,
        properties: {},
        linkData: {
          leftEntityId: blockEntity.metadata.recordId.entityId,
          rightEntityId: textEntity.metadata.recordId.entityId,
        },
      });

      return blockEntity;
    }),
  ]);

  await Promise.all(
    blockEntities.map(async (blockEntity, index) =>
      createEntity({
        entityTypeId: containsLinkEntityTypeId,
        properties: {
          [extractBaseUrl(numericIndexPropertyTypeId)]: index,
        },
        linkData: {
          leftEntityId: quickNoteEntity.metadata.recordId.entityId,
          rightEntityId: blockEntity.metadata.recordId.entityId,
        },
      }),
    ),
  );

  return quickNoteEntity;
};

export const QuickNoteAction = () => {
  const [draftQuickNote, setDraftQuickNote] = useSessionStorage(
    "draftQuickNote",
    "",
  );

  const saveQuickNote = () => {
    if (!draftQuickNote) {
      return;
    }

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
