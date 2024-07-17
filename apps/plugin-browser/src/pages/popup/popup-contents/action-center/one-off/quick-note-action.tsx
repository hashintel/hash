import { Button } from "@hashintel/design-system";
import { paragraphBlockComponentId } from "@local/hash-isomorphic-utils/blocks";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { QuickNote } from "@local/hash-isomorphic-utils/system-types/quicknote";
import type {
  Block,
  HasData,
  HasIndexedContent,
  Text,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { TextToken } from "@local/hash-isomorphic-utils/types";
import { Box } from "@mui/material";
import { generateKeyBetween } from "fractional-indexing";

import { createEntity } from "../../../../../shared/create-entity";
import { useStorageSync } from "../../../../shared/use-storage-sync";
import { Section } from "../shared/section";
import { TextFieldWithDarkMode } from "../text-field-with-dark-mode";
import { QuickNoteIcon } from "./quick-note-action/quick-note-icon";

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
    createEntity<QuickNote>({
      entityTypeId: systemEntityTypes.quickNote.entityTypeId,
      properties: { value: {} },
    }),
    ...paragraphs.map(async (paragraph) => {
      const [textEntity, blockEntity] = await Promise.all([
        createEntity<Text>({
          entityTypeId: systemEntityTypes.text.entityTypeId,
          properties: {
            value: {
              "https://blockprotocol.org/@blockprotocol/types/property-type/textual-content/":
                {
                  value: [
                    {
                      value: {
                        tokenType: "text",
                        text: paragraph,
                      } satisfies TextToken,
                      metadata: {
                        dataTypeId:
                          "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                      },
                    },
                  ],
                },
            },
          },
        }),
        createEntity<Block>({
          entityTypeId: systemEntityTypes.block.entityTypeId,
          properties: {
            value: {
              "https://hash.ai/@hash/types/property-type/component-id/": {
                value: paragraphBlockComponentId,
                metadata: {
                  dataTypeId:
                    "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                },
              },
            },
          },
        }),
      ]);

      await createEntity<HasData>({
        entityTypeId: systemLinkEntityTypes.hasData.linkEntityTypeId,
        properties: { value: {} },
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
      createEntity<HasIndexedContent>({
        entityTypeId: systemLinkEntityTypes.hasIndexedContent.linkEntityTypeId,
        properties: {
          value: {
            "https://hash.ai/@hash/types/property-type/fractional-index/": {
              value: fractionalIndexes[index]!,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            },
          },
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
  const [draftQuickNote, setDraftQuickNote] = useStorageSync(
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
    <Section
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
    </Section>
  );
};
