import { VersionedUri } from "@blockprotocol/type-system";
import { OwnedById } from "@hashintel/hash-shared/types";
import {
  EntityVertexId,
  extractEntityUuidFromEntityId,
  Subgraph,
  SubgraphRootTypes,
} from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";

import { useBlockProtocolCreateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-create-entity";
import { useBlockProtocolGetEntityType } from "../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { PageErrorState } from "../../../../components/page-error-state";
import { generateEntityLabel } from "../../../../lib/entities";
import { WorkspaceContext } from "../../../shared/workspace-context";
import { EditBar } from "../../types/entity-type/[entity-type-id].page/edit-bar";
import { EntityEditorPage } from "./entity-editor-page";
import { EntityPageLoadingState } from "./entity-page-loading-state";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";

interface CreateEntityPageProps {
  entityTypeId: VersionedUri;
}

export const CreateEntityPage = ({ entityTypeId }: CreateEntityPageProps) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();

  const { activeWorkspace, activeWorkspaceAccountId } =
    useContext(WorkspaceContext);
  const { createEntity } = useBlockProtocolCreateEntity(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
    (activeWorkspaceAccountId as OwnedById) ?? null,
  );

  const { getEntityType } = useBlockProtocolGetEntityType();

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);

        const { data: subgraph } = await getEntityType({
          data: {
            entityTypeId,
            graphResolveDepths: {
              constrainsValuesOn: { outgoing: 255 },
              constrainsLinksOn: { outgoing: 255 },
              constrainsLinkDestinationsOn: { outgoing: 255 },
              constrainsPropertiesOn: { outgoing: 255 },
            },
          },
        });

        if (!subgraph) {
          throw new Error("subgraph not found");
        }

        const draftEntityVertexId: EntityVertexId = {
          baseId: "draft%draft",
          version: new Date().toISOString(),
        };

        setDraftEntitySubgraph({
          ...subgraph,
          roots: [draftEntityVertexId],
          vertices: {
            ...subgraph.vertices,
            [draftEntityVertexId.baseId]: {
              [draftEntityVertexId.version]: {
                kind: "entity",
                inner: {
                  properties: {},
                  metadata: {
                    editionId: draftEntityVertexId,
                    entityTypeId,
                    provenance: { updatedById: "" },
                    archived: false,
                  },
                },
              },
            },
          },
        } as Subgraph<SubgraphRootTypes["entity"]>);
      } finally {
        setLoading(false);
      }
    };

    void init();
  }, [entityTypeId, getEntityType]);

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
