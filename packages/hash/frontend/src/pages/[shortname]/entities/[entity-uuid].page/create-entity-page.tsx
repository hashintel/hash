import { VersionedUri } from "@blockprotocol/type-system";
import { OwnedById } from "@hashintel/hash-shared/types";
import { extractEntityUuidFromEntityId } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useRouter } from "next/router";
import { useContext, useState } from "react";

import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { PageErrorState } from "../../../../components/page-error-state";
import { generateEntityLabel } from "../../../../lib/entities";
import { WorkspaceContext } from "../../../shared/workspace-context";
import { EditBar } from "../../types/entity-type/[entity-type-id].page/edit-bar";
import { EntityEditorPage } from "./entity-editor-page";
import { EntityPageLoadingState } from "./entity-page-loading-state";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useDraftEntitySubgraph } from "./shared/use-draft-entity-subgraph";

interface CreateEntityPageProps {
  entityTypeId: VersionedUri;
}

export const CreateEntityPage = ({ entityTypeId }: CreateEntityPageProps) => {
  const router = useRouter();

  const [draftEntitySubgraph, setDraftEntitySubgraph, loading] =
    useDraftEntitySubgraph(entityTypeId);

  const { activeWorkspace, activeWorkspaceAccountId } =
    useContext(WorkspaceContext);
  const { createEntity } = useBlockProtocolCreateEntity(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (activeWorkspaceAccountId as OwnedById) ?? null,
  );

  const [creating, setCreating] = useState(false);
  const handleCreateEntity = async () => {
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
          properties: draftEntity.properties,
        },
      });

      if (!entity) {
        return;
      }

      const entityId = extractEntityUuidFromEntityId(
        entity.metadata.editionId.baseId,
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

  return (
    <EntityEditorPage
      /**
       * @todo links section is hidden temporarily on new entity page
       * it should be visible again after draft state on links implemented
       * */
      hideLinksSection
      refetch={async () => {}}
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
      entitySubgraph={draftEntitySubgraph}
      entityUuid="draft"
      owner={`@${activeWorkspace?.shortname}`}
      setEntity={(entity) => {
        updateEntitySubgraphStateByEntity(entity, setDraftEntitySubgraph);
      }}
    />
  );
};
