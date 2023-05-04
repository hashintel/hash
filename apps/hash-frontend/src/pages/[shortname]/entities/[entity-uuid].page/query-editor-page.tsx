import { MultiFilter } from "@blockprotocol/graph";
import { EntityType, PropertyType } from "@blockprotocol/type-system";
import { OntologyChip, OntologyIcon } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import Head from "next/head";
import { useEffect, useState } from "react";

import { useBlockProtocolQueryEntityTypes } from "../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-entity-types";
import { useBlockProtocolQueryPropertyTypes } from "../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-property-types";
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
}

export const QueryEditorPage = (props: QueryEditorPageProps) => {
  const {
    entityLabel,
    owner,
    entityUuid,
    handleSaveQuery,
    ...entityEditorProps
  } = props;

  const [loading, setLoading] = useState(true);
  const [entityTypes, setEntityTypes] = useState<EntityType[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);

  const { queryEntityTypes } = useBlockProtocolQueryEntityTypes();
  const { queryPropertyTypes } = useBlockProtocolQueryPropertyTypes();

  useEffect(() => {
    const init = async () => {
      try {
        const { data: entityTypesSubgraph } = await queryEntityTypes({
          data: {},
        });
        const { data: propertyTypesSubgraph } = await queryPropertyTypes({
          data: {},
        });

        if (!entityTypesSubgraph || !propertyTypesSubgraph) {
          return;
        }

        const mappedEntityTypes = getRoots(entityTypesSubgraph).map(
          (type) => type.schema,
        );
        const mappedPropertyTypes = getRoots(propertyTypesSubgraph).map(
          (type) => type.schema,
        );

        setEntityTypes(mappedEntityTypes);
        setPropertyTypes(mappedPropertyTypes);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [queryEntityTypes, queryPropertyTypes]);

  const entity = getRoots(entityEditorProps.entitySubgraph)[0];
  const defaultValue = entity?.properties[QUERY_PROPERTY_TYPE_BASE_URL];

  return (
    <>
      <Head>
        <title>{entityLabel} | Entity | HASH</title>
      </Head>
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

            {loading ? (
              <Box>Loading...</Box>
            ) : (
              <EntityQueryEditor
                readonly={entityEditorProps.readonly}
                defaultValue={defaultValue}
                entityTypes={entityTypes}
                propertyTypes={propertyTypes}
                /** @todo implement bp query entities */
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-ignore
                queryEntities={() => {
                  return { data: { results: { roots: [], vertices: {} } } };
                }}
                onDiscard={() => alert("discard")}
                onSave={handleSaveQuery}
              />
            )}
          </Box>
        </EntityEditorContextProvider>
      </EntityPageWrapper>
    </>
  );
};
