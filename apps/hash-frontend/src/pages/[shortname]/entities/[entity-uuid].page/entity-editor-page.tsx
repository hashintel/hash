import { OntologyChip } from "@hashintel/design-system";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import { EntityPropertiesObject } from "@local/hash-subgraph";
import { Typography } from "@mui/material";
import { NextSeo } from "next-seo";
import { ReactNode, useState } from "react";

import { useSnackbar } from "../../../../components/hooks/use-snackbar";
import { QUERY_PROPERTY_TYPE_BASE_URL } from "./create-entity-page";
import { EntityEditor, EntityEditorProps } from "./entity-editor";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";
import { QueryEditorPage } from "./query-editor-page";
import { QueryEditorToggle } from "./query-editor-toggle";

interface EntityEditorPageProps extends EntityEditorProps {
  entityLabel: string;
  editBar: ReactNode;
  owner: string;
  entityUuid: string;
  isQueryEntity?: boolean;
  isDraft?: boolean;
  handleSaveChanges: (
    overrideProperties?: EntityPropertiesObject,
  ) => Promise<void>;
}

export const EntityEditorPage = ({
  entityLabel,
  editBar,
  entityUuid,
  owner,
  isDraft,
  isQueryEntity,
  handleSaveChanges,
  ...entityEditorProps
}: EntityEditorPageProps) => {
  const [shouldShowQueryEditor, setShouldShowQueryEditor] = useState(true);
  const snackbar = useSnackbar();

  return (
    <>
      <NextSeo title={`${entityLabel} | Entity`} />

      {isQueryEntity && (
        <QueryEditorToggle
          shouldShowQueryEditor={shouldShowQueryEditor}
          toggle={() => setShouldShowQueryEditor((val) => !val)}
        />
      )}
      {isQueryEntity && shouldShowQueryEditor ? (
        <QueryEditorPage
          mode={isDraft ? "create" : "edit"}
          handleSaveQuery={async (value) => {
            const properties = {
              [QUERY_PROPERTY_TYPE_BASE_URL]: value,
            };

            await handleSaveChanges(properties);

            if (!isDraft) {
              snackbar.success("Changes saved successfully");
            }
          }}
          entityLabel={entityLabel}
          entityUuid={entityUuid}
          owner={owner}
          {...entityEditorProps}
        />
      ) : (
        <EntityPageWrapper
          header={
            <EntityPageHeader
              entityLabel={entityLabel}
              editBar={editBar}
              chip={
                <OntologyChip
                  domain={frontendDomain}
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
          {/* use `satisfies EntityEditorProps` here when satisfies keyword is supported to make this safer */}
          <EntityEditor {...entityEditorProps} />
        </EntityPageWrapper>
      )}
    </>
  );
};
