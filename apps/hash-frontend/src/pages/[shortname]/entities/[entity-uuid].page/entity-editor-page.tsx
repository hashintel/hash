import { OntologyChip } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import { frontendDomain } from "@local/hash-isomorphic-utils/environment";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { NextSeo } from "next-seo";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";

import { useSnackbar } from "../../../../components/hooks/use-snackbar";
import { generateEntityRootedSubgraph } from "../../../shared/subgraphs";
import { EditEntitySlideOver } from "./edit-entity-slide-over";
import type { EntityEditorProps } from "./entity-editor";
import { EntityEditor } from "./entity-editor";
import { EntityPageWrapper } from "./entity-page-wrapper";
import { EntityPageHeader } from "./entity-page-wrapper/entity-page-header";
import { QueryEditorPage } from "./query-editor-page";
import { QueryEditorToggle } from "./query-editor-toggle";

interface EntityEditorPageProps
  extends Omit<EntityEditorProps, "onEntityClick"> {
  entity?: Entity;
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

  const { entityLabel, entitySubgraph, onEntityUpdated } = entityEditorProps;

  const [selectedEntity, setSelectedEntity] = useState<{
    entityId: EntityId;
    subgraph?: Subgraph<EntityRootType>;
  } | null>(null);

  const handleEntityClick = useCallback(
    (entityId: EntityId) => {
      try {
        const subgraph = generateEntityRootedSubgraph(entityId, entitySubgraph);

        setSelectedEntity({
          entityId,
          subgraph,
        });
      } catch (err) {
        setSelectedEntity({ entityId });
      }
    },
    [entitySubgraph],
  );

  return (
    <>
      <NextSeo title={`${entityLabel} | Entity`} />

      {selectedEntity ? (
        <EditEntitySlideOver
          entitySubgraph={selectedEntity.subgraph}
          entityId={selectedEntity.entityId}
          onEntityClick={handleEntityClick}
          open
          onClose={() => setSelectedEntity(null)}
          onSubmit={() => {
            throw new Error(`Editing not yet supported from this screen`);
          }}
          readonly
        />
      ) : null}

      {isQueryEntity && (
        <QueryEditorToggle
          shouldShowQueryEditor={shouldShowQueryEditor}
          toggle={() => setShouldShowQueryEditor((val) => !val)}
        />
      )}
      {isQueryEntity && shouldShowQueryEditor ? (
        <QueryEditorPage
          onEntityClick={handleEntityClick}
          mode={isDraft ? "create" : "edit"}
          handleSaveQuery={async (value) => {
            const properties = {
              [blockProtocolPropertyTypes.query.propertyTypeBaseUrl]: value,
            };

            await handleSaveChanges(properties);

            if (!isDraft) {
              triggerSnackbar.success("Changes saved successfully");
            }
          }}
          entityUuid={entityUuid}
          owner={owner}
          {...entityEditorProps}
        />
      ) : (
        <EntityPageWrapper
          header={
            <EntityPageHeader
              entity={entity}
              entitySubgraph={entitySubgraph}
              isModifyingEntity={isModifyingEntity}
              /** @todo: figure out how to replace the entity in the form state directly */
              onEntityUpdated={onEntityUpdated}
              entityLabel={entityLabel}
              editBar={editBar}
              chip={
                <OntologyChip
                  domain={frontendDomain}
                  path={`${owner}/entities/${entityUuid}`}
                />
              }
              showTabs
            />
          }
        >
          {/* use `satisfies EntityEditorProps` here when satisfies keyword is supported to make this safer */}
          <EntityEditor
            {...entityEditorProps}
            onEntityClick={handleEntityClick}
          />
        </EntityPageWrapper>
      )}
    </>
  );
};
