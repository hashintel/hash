import { Typography } from "@mui/material";
import Head from "next/head";
import { ReactNode } from "react";

import { HashOntologyIcon } from "../../shared/hash-ontology-icon";
import { OntologyChip } from "../../shared/ontology-chip";
import { EntityEditor, EntityEditorProps } from "./entity-editor";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";

interface EntityEditorPageProps extends EntityEditorProps {
  entityLabel: string;
  editBar: ReactNode;
  owner: string;
  entityUuid: string;
  hideLinksSection?: boolean;
}

export const EntityEditorPage = ({
  entityLabel,
  editBar,
  entityUuid,
  owner,
  entitySubgraph,
  setEntity,
  refetch,
  hideLinksSection,
}: EntityEditorPageProps) => {
  return (
    <>
      <Head>
        <title>{entityLabel} | Entity | HASH</title>
      </Head>
      <EntityPageWrapper
        header={
          <EntityPageHeader
            entityLabel={entityLabel}
            editBar={editBar}
            chip={
              <OntologyChip
                icon={<HashOntologyIcon />}
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
        <EntityEditor
          refetch={refetch}
          entitySubgraph={entitySubgraph}
          setEntity={setEntity}
          hideLinksSection={!!hideLinksSection}
        />
      </EntityPageWrapper>
    </>
  );
};
