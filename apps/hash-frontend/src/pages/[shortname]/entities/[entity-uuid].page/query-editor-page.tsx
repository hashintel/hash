import { MultiFilter } from "@blockprotocol/graph";
import { OntologyChip, OntologyIcon } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { zeroedGraphResolveDepths } from "@local/hash-isomorphic-utils/graph-queries";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useCallback, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import {
  useEntityTypesLoading,
  useLatestEntityTypesOptional,
} from "../../../../shared/entity-types-context/hooks";
import { useLatestPropertyTypes } from "../../../../shared/latest-property-types-context";
import { QUERY_PROPERTY_TYPE_BASE_URL } from "./create-entity-page";
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
  const propertyTypes = useLatestPropertyTypes();
  const entityTypes = useLatestEntityTypesOptional();
  const entityTypesLoading = useEntityTypesLoading();

  const entityTypeSchemas = entityTypes?.map((type) => type.schema) ?? [];

  const propertyTypeSchemas = propertyTypes
    ? Object.values(propertyTypes).map((type) => type.schema)
    : [];

  const entity = getRoots(entityEditorProps.entitySubgraph)[0];
  const defaultValue = (entity?.properties as any)[
    QUERY_PROPERTY_TYPE_BASE_URL
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

      return getRoots(res.data);
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
                icon={<OntologyIcon />}
                domain="hash.ai"
                path={
                  <Typography>
                    <Typography
                      color={(theme) => theme.palette.blue[70]}
                      component="span"
                      fontWeight="bold"
                    >
                      {owner}
                    </Typography>
                    <Typography
                      color={(theme) => theme.palette.blue[70]}
                      component="span"
                    >
                      /entities/
                    </Typography>
                    <Typography
                      color={(theme) => theme.palette.blue[70]}
                      component="span"
                      fontWeight="bold"
                    >
                      {entityUuid}
                    </Typography>
                  </Typography>
                }
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
            )}
          </Box>
        </EntityEditorContextProvider>
      </EntityPageWrapper>
    </>
  );
};
