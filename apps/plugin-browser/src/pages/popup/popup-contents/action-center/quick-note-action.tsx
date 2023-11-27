import { VersionedUrl } from "@blockprotocol/type-system";
import { Button } from "@hashintel/design-system";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  BlockProperties,
  HasIndexedContentProperties,
  TextProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import { TextToken } from "@local/hash-isomorphic-utils/types";
import { Entity, EntityPropertiesObject, LinkData } from "@local/hash-subgraph";
import { Box } from "@mui/material";
import { generateKeyBetween } from "fractional-indexing";

import {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import { createEntityMutation } from "../../../../graphql/queries/entity.queries";
import { queryGraphQlApi } from "../../../../shared/query-graph-ql-api";
import { useSessionStorage } from "../../../shared/use-storage-sync";
import { Action } from "./action";
import { QuickNoteIcon } from "./quick-note-action/quick-note-icon";
import { TextFieldWithDarkMode } from "./text-field-with-dark-mode";

const createEntity = (params: {
  entityTypeId: VersionedUrl;
  properties: EntityPropertiesObject;
  linkData?: LinkData;
}): Promise<Entity> =>
  queryGraphQlApi<CreateEntityMutation, CreateEntityMutationVariables>(
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
      entityTypeId: systemEntityTypes.quickNote.entityTypeId,
      properties: {},
    }),
    ...paragraphs.map(async (paragraph) => {
      const [textEntity, blockEntity] = await Promise.all([
        createEntity({
          entityTypeId: systemEntityTypes.text.entityTypeId,
          properties: {
            "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
              [{ tokenType: "text", text: paragraph }] satisfies TextToken[],
          } as TextProperties,
        }),
        createEntity({
          entityTypeId: systemEntityTypes.block.entityTypeId,
          properties: {
            "https://hash.ai/@hash/types/property-type/component-id/":
              paragraphBlockComponentId,
          } as BlockProperties,
        }),
      ]);

      await createEntity({
        entityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
        properties: {},
        linkData: {
          leftEntityId: blockEntity.metadata.recordId.entityId,
          rightEntityId: textEntity.metadata.recordId.entityId,
        },
      });

      return blockEntity;
    }),
  ]);

  const fractionalIndexes = blockEntities.reduce<string[]>((prev) => {
    const previousFractionalIndex = prev[prev.length - 1] ?? null;

    return [...prev, generateKeyBetween(previousFractionalIndex, null)];
  }, []);

  await Promise.all(
    blockEntities.map(async (blockEntity, index) =>
      createEntity({
        entityTypeId: systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
        properties: {
          "https://hash.ai/@hash/types/property-type/fractional-index/":
            fractionalIndexes[index]!,
        } as HasIndexedContentProperties,
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
