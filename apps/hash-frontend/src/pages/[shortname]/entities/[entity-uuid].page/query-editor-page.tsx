import type { Entity as EntityBp } from "@blockprotocol/graph";
import { MultiFilter } from "@blockprotocol/graph";
import { OntologyChip } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useCallback, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import {
  useEntityTypesLoading,
  useLatestEntityTypesOptional,
} from "../../../../shared/entity-types-context/hooks";
import { usePropertyTypes } from "../../../../shared/property-types-context";
import { EntityEditorProps } from "./entity-editor";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { TypesSection } from "./entity-editor/types-section";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";

interface QueryEditorPageProps extends EntityEditorProps {
  entityLabel: string;
  owner: string;
  entityUuid: string;
  handleSaveQuery: (value: MultiFilter) => Promise<void>;
  mode: "create" | "edit";
}

export const QueryEditorPage = (props: QueryEditorPageProps) => {
  const {
    entityLabel,
    owner,
    entityUuid,
    handleSaveQuery,
    mode,
    ...entityEditorProps
  } = props;

  const router = useRouter();

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
      const res = await queryEntities({
        data: {
          operation: { multiFilter },
          graphResolveDepths: zeroedGraphResolveDepths,
        },
      });

      if (!res.data) {
        throw new Error(res.errors?.[0]?.message ?? "Unknown error");
      }

      return getRoots(res.data.results) as unknown as EntityBp[];
    },
    [queryEntities],
  );

  return (
    <>
      <NextSeo title={`${entityLabel} | Entity`} />

      <EntityPageWrapper
        header={
          <EntityPageHeader
            entityLabel={entityLabel}
            chip={
              <OntologyChip
                domain={frontendDomain}
                path={`${owner}/entities/${entityUuid}`}
              />
            }
          />
        }
      >
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
                    if (mode === "create") {
                      return router.push("/new/entity");
                    }

                    /**
                     * this is not the best way to do this, but it works for now
                     * to discard changes, we just change the key to make `EntityQueryEditor` re-render,
                     * which resets the state of `EntityQueryEditor`, and thus discards the changes
                     */
                    setQueryEditorKey((key) => key + 1);
                  }}
                  discardTitle={mode === "edit" ? "Discard changes" : undefined}
                  saveTitle={mode === "edit" ? "Save changes" : undefined}
                  onSave={handleSaveQuery}
                />
              </Box>
            )}
          </Box>
        </EntityEditorContextProvider>
      </EntityPageWrapper>
    </>
  );
};
