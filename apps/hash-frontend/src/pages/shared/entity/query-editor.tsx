import type { MultiFilter } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { Entity as EntityBp } from "@blockprotocol/type-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { Box, Stack, Typography } from "@mui/material";
import { NextSeo } from "next-seo";
import { useCallback, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import {
  useEntityTypesLoading,
  useLatestEntityTypesOptional,
} from "../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../shared/property-types-context";
import type { EntityEditorProps } from "./entity-editor";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { TypesSection } from "./entity-editor/types-section";
import { EntityEditorContainer } from "./entity-editor-container";
import { EntityHeader } from "./entity-header";

interface QueryEditorProps extends EntityEditorProps {
  handleSaveQuery: (value: MultiFilter) => Promise<void>;
  isInSlide: boolean;
  mode:
    | {
        type: "create";
        onDraftDiscarded?: () => void;
      }
    | {
        type: "edit";
      };
}

export const QueryEditor = (props: QueryEditorProps) => {
  const { handleSaveQuery, mode, isInSlide, ...entityEditorProps } = props;

  const [queryEditorKey, setQueryEditorKey] = useState(0);

  const { queryEntities } = useBlockProtocolQueryEntities();
  const { propertyTypes } = usePropertyTypes({ latestOnly: true });
  const { latestEntityTypes } = useLatestEntityTypesOptional();
  const entityTypesLoading = useEntityTypesLoading();

  const entityTypeSchemas = latestEntityTypes?.map((type) => type.schema) ?? [];

  const propertyTypeSchemas = propertyTypes
    ? Object.values(propertyTypes).map((type) => type.schema)
    : [];

  const entity = getRoots(entityEditorProps.entitySubgraph)[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const defaultValue = (entity?.properties as any)[
    blockProtocolPropertyTypes.query.propertyTypeBaseUrl
  ];

  const handleQueryEntities = useCallback(
    async (multiFilter: MultiFilter) => {
      /**
       * When this is changed to a structural query, if drafts are included
       * then there may be multiple roots for a single entity (a live and zero or more draft updates)
       */
      const res = await queryEntities({
        data: {
          operation: { multiFilter },
        },
      });

      if (!res.data) {
        throw new Error(res.errors?.[0]?.message ?? "Unknown error");
      }

      return getRoots(res.data.results) as EntityBp[];
    },
    [queryEntities],
  );

  const { entityLabel } = entityEditorProps;

  return (
    <>
      <NextSeo title={`${entityLabel} | Entity`} />

      <EntityHeader
        entityLabel={entityLabel}
        isInSlide={isInSlide}
        isLocalDraft={false}
        onDraftArchived={() => {
          throw new Error(
            "Unexpected call to onDraftArchived from query editor",
          );
        }}
        onDraftPublished={() => {
          throw new Error(
            "Unexpected call to onDraftPublished from query editor",
          );
        }}
        onUnarchived={() => {
          throw new Error("Unexpected call to onUnarchived from query editor");
        }}
      />

      <EntityEditorContainer isInSlide={false}>
        <EntityEditorContextProvider {...entityEditorProps}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 6.5 }}>
            <TypesSection />

            {entityTypesLoading ? (
              <Box>Loading</Box>
            ) : (
              <Box
                sx={{
                  border: ({ palette }) => `1px solid ${palette.gray[30]}`,
                  p: 2.5,
                  borderRadius: 2,
                  background: "white",
                  overflowX: "auto",
                }}
              >
                <Stack gap={1}>
                  <Typography sx={{ fontWeight: 500 }}>
                    QUERY FOR ENTITIES
                  </Typography>
                  <Typography
                    sx={{
                      color: ({ palette }) => palette.gray[70],
                      fontSize: 14,
                    }}
                  >
                    Queries return entities matching specified parameters and
                    display them in the table
                  </Typography>
                </Stack>
                <EntityQueryEditor
                  key={queryEditorKey}
                  readonly={entityEditorProps.readonly}
                  defaultValue={defaultValue}
                  entityTypes={entityTypeSchemas}
                  propertyTypes={propertyTypeSchemas}
                  queryEntities={handleQueryEntities}
                  onDiscard={() => {
                    if (mode.type === "create") {
                      mode.onDraftDiscarded?.();
                      return;
                    }

                    /**
                     * this is not the best way to do this, but it works for now
                     * to discard changes, we just change the key to make `EntityQueryEditor` re-render,
                     * which resets the state of `EntityQueryEditor`, and thus discards the changes
                     */
                    setQueryEditorKey((key) => key + 1);
                  }}
                  discardTitle={
                    mode.type === "edit" ? "Discard changes" : undefined
                  }
                  saveTitle={mode.type === "edit" ? "Save changes" : undefined}
                  onSave={handleSaveQuery}
                />
              </Box>
            )}
          </Box>
        </EntityEditorContextProvider>
      </EntityEditorContainer>
    </>
  );
};
