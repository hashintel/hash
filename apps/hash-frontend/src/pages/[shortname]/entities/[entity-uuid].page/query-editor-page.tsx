import { GraphResolveDepths, MultiFilter } from "@blockprotocol/graph";
import { OntologyChip, OntologyIcon } from "@hashintel/design-system";
import { EntityQueryEditor } from "@hashintel/query-editor";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Typography } from "@mui/material";
import Head from "next/head";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";

import { useBlockProtocolQueryEntities } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-query-entities";
import { useLatestPropertyTypesContextValue } from "../../types/entity-type/[...slug-maybe-version].page/shared/use-latest-property-types-context-value";
import { QUERY_PROPERTY_TYPE_BASE_URL } from "./create-entity-page";
import { EntityEditorProps } from "./entity-editor";
import { EntityEditorContextProvider } from "./entity-editor/entity-editor-context";
import { TypesSection } from "./entity-editor/types-section";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";

const zeroedGraphResolveDepths: GraphResolveDepths = {
  inheritsFrom: { outgoing: 0 },
  constrainsValuesOn: { outgoing: 0 },
  constrainsPropertiesOn: { outgoing: 0 },
  constrainsLinksOn: { outgoing: 0 },
  constrainsLinkDestinationsOn: { outgoing: 0 },
  isOfType: { outgoing: 0 },
  hasLeftEntity: { incoming: 0, outgoing: 0 },
  hasRightEntity: { incoming: 0, outgoing: 0 },
};

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
  const { propertyTypes } = useLatestPropertyTypesContextValue();

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

            <EntityQueryEditor
              key={queryEditorKey}
              readonly={entityEditorProps.readonly}
              defaultValue={defaultValue}
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
        </EntityEditorContextProvider>
      </EntityPageWrapper>
    </>
  );
};
