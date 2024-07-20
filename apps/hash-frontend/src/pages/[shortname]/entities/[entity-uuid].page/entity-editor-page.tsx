import { NextSeo } from "next-seo";
import type { ReactNode, useState } from "react";
import { OntologyChip } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { PropertyObject } from "@local/hash-graph-types/entity";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { useSnackbar } from "../../../../components/hooks/use-snackbar";

import type { EntityEditor, EntityEditorProps } from "./entity-editor";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";
import { QueryEditorPage } from "./query-editor-page";
import { QueryEditorToggle } from "./query-editor-toggle";

interface EntityEditorPageProps extends EntityEditorProps {
  entity?: Entity;
  entityLabel: string;
  editBar: ReactNode;
  owner: string;
  entityUuid: string;
  isQueryEntity?: boolean;
  isDraft?: boolean;
  isModifyingEntity?: boolean;
  handleSaveChanges: (overrideProperties?: PropertyObject) => Promise<void>;
}

export const EntityEditorPage = ({
  entity,
  entityLabel,
  editBar,
  entityUuid,
  owner,
  isDraft,
  isQueryEntity,
  handleSaveChanges,
  isModifyingEntity,
  ...entityEditorProps
}: EntityEditorPageProps) => {
  const [shouldShowQueryEditor, setShouldShowQueryEditor] = useState(true);
  const { triggerSnackbar } = useSnackbar();

  const { entitySubgraph, onEntityUpdated } = entityEditorProps;

  return (
    <>
      <NextSeo title={`${entityLabel} | Entity`} />

      {isQueryEntity && (
        <QueryEditorToggle
          shouldShowQueryEditor={shouldShowQueryEditor}
          toggle={() => {
            setShouldShowQueryEditor((value) => !value);
          }}
        />
      )}
      {isQueryEntity && shouldShowQueryEditor ? (
        <QueryEditorPage
          mode={isDraft ? "create" : "edit"}
          entityLabel={entityLabel}
          entityUuid={entityUuid}
          owner={owner}
          handleSaveQuery={async (value) => {
            const properties = {
              [blockProtocolPropertyTypes.query.propertyTypeBaseUrl]: value,
            };

            await handleSaveChanges(properties);

            if (!isDraft) {
              triggerSnackbar.success("Changes saved successfully");
            }
          }}
          {...entityEditorProps}
        />
      ) : (
        <EntityPageWrapper
          header={
            <EntityPageHeader
              showTabs
              entity={entity}
              entitySubgraph={entitySubgraph}
              entityLabel={entityLabel}
              editBar={editBar}
              chip={
                <OntologyChip
                  domain={frontendDomain}
                  path={`${owner}/entities/${entityUuid}`}
                />
              }
              isModifyingEntity={isModifyingEntity}
              /** @todo: figure out how to replace the entity in the form state directly */
              onEntityUpdated={onEntityUpdated}
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
