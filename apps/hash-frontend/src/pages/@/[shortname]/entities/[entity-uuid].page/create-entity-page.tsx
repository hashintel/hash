import { useMutation } from "@apollo/client";
import type { EntityUuid, VersionedUrl } from "@blockprotocol/type-system";
import {
  entityIdFromComponents,
  extractEntityUuidFromEntityId,
} from "@blockprotocol/type-system";
import { AlertModal } from "@hashintel/design-system";
import {
  HashEntity,
  mergePropertyObjectAndMetadata,
} from "@local/hash-graph-sdk/entity";
import { GlobalStyles, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useContext, useState } from "react";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import {
  createEntityMutation,
  queryEntitySubgraphQuery,
} from "../../../../../graphql/queries/knowledge/entity.queries";
import { Link } from "../../../../../shared/ui/link";
import { generateSidebarEntityTypeEntitiesQueryVariables } from "../../../../../shared/use-entity-type-entities";
import { Entity } from "../../../../shared/entity";
import { EntityPageLoadingState } from "../../../../shared/entity/entity-page-loading-state";
import { useApplyDraftLinkEntityChanges } from "../../../../shared/entity/shared/use-apply-draft-link-entity-changes";
import type { DraftLinksToCreate } from "../../../../shared/entity/shared/use-draft-link-state";
import { WorkspaceContext } from "../../../../shared/workspace-context";
import { createInitialDraftEntitySubgraph } from "./create-entity-page/create-initial-draft-entity-subgraph";

interface CreateEntityPageProps {
  entityTypeId: VersionedUrl;
}

export const CreateEntityPage = ({ entityTypeId }: CreateEntityPageProps) => {
  const router = useRouter();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { activeWorkspace, activeWorkspaceWebId } =
    useContext(WorkspaceContext);

  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation, {
    refetchQueries: activeWorkspaceWebId
      ? [
          /**
           * This refetch query accounts for the "Entities" section
           * in the sidebar being updated when the first instance of
           * a type is created by a user that is from a different web.
           */
          {
            query: queryEntitySubgraphQuery,
            variables: generateSidebarEntityTypeEntitiesQueryVariables({
              webId: activeWorkspaceWebId,
            }),
          },
        ]
      : [],
  });

  /**
   * This state is only necessary to update the entity's label in the HTML <title> when the entity is loaded and when it changes.
   * The child component {@link Entity} is really managing the state and reporting changes back.
   */
  const [entityLabel, setEntityLabel] = useState<string>("");

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  if (!activeWorkspaceWebId) {
    return <EntityPageLoadingState />;
  }

  const handleCreateEntity = async ({
    localDraft,
    draftLinksToCreate,
  }: {
    localDraft: HashEntity;
    draftLinksToCreate: DraftLinksToCreate;
  }) => {
    if (!activeWorkspace) {
      return;
    }

    try {
      const { data } = await createEntity({
        variables: {
          entityTypeIds: localDraft.metadata.entityTypeIds,
          webId: activeWorkspaceWebId,
          properties: mergePropertyObjectAndMetadata(
            localDraft.properties,
            localDraft.metadata.properties,
          ),
        },
      });

      const createdEntity = data?.createEntity
        ? new HashEntity(data.createEntity)
        : null;

      if (!createdEntity) {
        return;
      }

      await applyDraftLinkEntityChanges(createdEntity, draftLinksToCreate, []);

      const entityUuid = extractEntityUuidFromEntityId(
        createdEntity.metadata.recordId.entityId,
      );

      void router.push(`/@${activeWorkspace.shortname}/entities/${entityUuid}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const entityId = entityIdFromComponents(
    activeWorkspaceWebId,
    "draft" as EntityUuid,
  );

  return (
    <>
      <NextSeo title={`${entityLabel ? `${entityLabel} | ` : ""}HASH`} />

      {errorMessage && (
        <AlertModal
          calloutMessage={errorMessage}
          close={() => setErrorMessage("")}
          header="Couldn't create entity"
          type="warning"
        >
          <Typography>
            Please <Link href="https://hash.ai/contact">contact us</Link> and
            tell us what entity you were trying to create when this happened
          </Typography>
        </AlertModal>
      )}
      <Entity
        draftLocalEntity={{
          entityTypeId,
          createFromLocalDraft: handleCreateEntity,
          initialSubgraph: createInitialDraftEntitySubgraph([entityTypeId]),
          onDraftDiscarded: () => {
            void router.push("/new/entity");
          },
        }}
        entityId={entityId}
        isInSlide={false}
        onEntityLabelChange={setEntityLabel}
        onEntityUpdatedInDb={() => {
          throw new Error(
            "Unexpected call to onEntityUpdatedInDb from new entity page",
          );
        }}
        onRemoteDraftArchived={() => {
          throw new Error(
            "Unexpected call to onRemoteDraftArchived from new entity page",
          );
        }}
        onRemoteDraftPublished={() => {
          throw new Error(
            "Unexpected call to onRemoteDraftPublished from new entity page",
          );
        }}
      />

      <GlobalStyles
        styles={{
          body: {
            overflowY: "scroll",
          },
        }}
      />
    </>
  );
};
