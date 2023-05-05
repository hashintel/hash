import { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId, OwnedById } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { PageErrorState } from "../../../../components/page-error-state";
import { generateEntityLabel } from "../../../../lib/entities";
import { WorkspaceContext } from "../../../shared/workspace-context";
import { EditBar } from "../../types/entity-type/[...slug-maybe-version].page/shared/edit-bar";
import { EntityEditorProps } from "./entity-editor";
import { EntityEditorPage } from "./entity-editor-page";
import { EntityPageLoadingState } from "./entity-page-loading-state";
import { QueryEditorPage } from "./query-editor-page";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftEntitySubgraph } from "./shared/use-draft-entity-subgraph";
import { useDraftLinkState } from "./shared/use-draft-link-state";

interface CreateEntityPageProps {
  entityTypeId: VersionedUrl;
}

/** @todo replace these with published system types */
export const QUERY_ENTITY_TYPE_ID =
  "http://localhost:3000/@alice/types/entity-type/query-entity/v/2" as VersionedUrl;
export const QUERY_PROPERTY_TYPE_BASE_URL =
  "http://localhost:3000/@alice/types/property-type/query/" as BaseUrl;

export const CreateEntityPage = ({ entityTypeId }: CreateEntityPageProps) => {
  const router = useRouter();
  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  const [draftEntitySubgraph, setDraftEntitySubgraph, loading] =
    useDraftEntitySubgraph(entityTypeId);

  const { activeWorkspace, activeWorkspaceAccountId } =
    useContext(WorkspaceContext);
  const { createEntity } = useBlockProtocolCreateEntity(
    (activeWorkspaceAccountId as OwnedById | undefined) ?? null,
  );

  const [creating, setCreating] = useState(false);

  /**
   * `overrideProperties` is a quick hack to bypass the setting draftEntity state
   * I did this, because I was having trouble with the `setDraftEntitySubgraph` function,
   * I tried calling handleCreateEntity after setting the draftEntity state, but state was not updating
   * @todo find a better way to do this
   */
  const handleCreateEntity = async (overrideProperties: any) => {
    if (!draftEntitySubgraph || !activeWorkspace) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setCreating(true);
      const { data: entity } = await createEntity({
        data: {
          entityTypeId,
          properties: overrideProperties ?? draftEntity.properties,
        },
      });

      if (!entity) {
        return;
      }

      await applyDraftLinkEntityChanges(
        entity.metadata.recordId.entityId,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      const entityId = extractEntityUuidFromEntityId(
        entity.metadata.recordId.entityId,
      );

      void router.push(`/@${activeWorkspace.shortname}/entities/${entityId}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntitySubgraph) {
    return <PageErrorState />;
  }

  const entityLabel = generateEntityLabel(draftEntitySubgraph);

  const shouldShowQueryEditor = entityTypeId === QUERY_ENTITY_TYPE_ID;

  const entityEditorProps: EntityEditorProps = {
    setEntity: (entity) => {
      updateEntitySubgraphStateByEntity(entity, setDraftEntitySubgraph);
    },
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
    entitySubgraph: draftEntitySubgraph,
    readonly: false,
    refetch: async () => {},
  };

  if (shouldShowQueryEditor) {
    return (
      <QueryEditorPage
        mode="create"
        handleSaveQuery={async (value) => {
          const properties = {
            [QUERY_PROPERTY_TYPE_BASE_URL]: value,
          };

          await handleCreateEntity(properties);
        }}
        entityLabel={entityLabel}
        entityUuid="draft"
        owner={`@${activeWorkspace?.shortname}`}
        {...entityEditorProps}
      />
    );
  }

  return (
    <EntityEditorPage
      editBar={
        <EditBar
          label="- this entity has not been created yet"
          visible
          discardButtonProps={{
            href: "/new/entity",
            children: "Discard entity",
          }}
          confirmButtonProps={{
            onClick: handleCreateEntity,
            loading: creating,
            children: "Create entity",
          }}
        />
      }
      entityLabel={entityLabel}
      entityUuid="draft"
      owner={`@${activeWorkspace?.shortname}`}
      {...entityEditorProps}
    />
  );
};
