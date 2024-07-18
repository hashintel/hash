import { useLazyQuery, useMutation } from "@apollo/client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import {
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import type {
  DraftId,
  EntityId,
  EntityUuid,
  PropertyObject,
} from "@local/hash-graph-types/entity";
import type { OwnedById } from "@local/hash-graph-types/web";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  entityIdFromComponents,
  extractDraftIdFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import NextErrorComponent from "next/error";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { useBlockProtocolGetEntityType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { PageErrorState } from "../../../components/page-error-state";
import type {
  GetEntityQuery,
  GetEntityQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { EditBar } from "../shared/edit-bar";
import { useRouteNamespace } from "../shared/use-route-namespace";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { updateEntitySubgraphStateByEntity } from "./[entity-uuid].page/shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./[entity-uuid].page/shared/use-draft-link-state";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
  const draftId = router.query.draftId as DraftId | undefined;

  const { routeNamespace } = useRouteNamespace();

  const [lazyGetEntity] = useLazyQuery<GetEntityQuery, GetEntityQueryVariables>(
    getEntityQuery,
    { fetchPolicy: "cache-and-network" },
  );
  const { getEntityType } = useBlockProtocolGetEntityType();

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [entitySubgraphFromDb, setEntitySubgraphFromDb] =
    useState<Subgraph<EntityRootType>>();
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();
  const [isReadOnly, setIsReadOnly] = useState(true);

  const entityFromDb =
    entitySubgraphFromDb && getRoots(entitySubgraphFromDb)[0];

  /**
   * If the user is viewing a `User` entity, redirect to its profile page.
   *
   * @todo: reconsider this once we have property level permissions, where
   * we can prevent users from directly modifying specific user entity properties.
   */
  useEffect(() => {
    if (
      entityFromDb &&
      extractBaseUrl(entityFromDb.metadata.entityTypeId) ===
        systemEntityTypes.user.entityTypeBaseUrl
    ) {
      const { shortname } = simplifyProperties(
        entityFromDb.properties as UserProperties,
      );

      void router.push(shortname ? `/@${shortname}` : "/");
    }
  }, [entityFromDb, router]);

  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  const getEntity = useCallback(
    (entityId: EntityId) =>
      lazyGetEntity({
        variables: {
          entityId,
          constrainsValuesOn: { outgoing: 255 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 1 },
          includePermissions: true,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
          hasLeftEntity: { outgoing: 1, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 1 },
          includeDrafts: !!draftId,
        },
      }),
    [draftId, lazyGetEntity],
  );

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  useEffect(() => {
    if (routeNamespace) {
      const init = async () => {
        try {
          const entityId = entityIdFromComponents(
            routeNamespace.accountId as OwnedById,
            entityUuid,
            draftId,
          );

          const { data } = await getEntity(entityId);

          const subgraph = data
            ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
                data.getEntity.subgraph,
              )
            : undefined;

          if (data?.getEntity) {
            try {
              setEntitySubgraphFromDb(subgraph);
              setDraftEntitySubgraph(subgraph);
              setIsReadOnly(
                !data.getEntity.userPermissionsOnEntities?.[entityId]?.edit,
              );
            } catch {
              setEntitySubgraphFromDb(undefined);
              setDraftEntitySubgraph(undefined);
              setIsReadOnly(true);
            }
          }
        } finally {
          setLoading(false);
        }
      };

      void init();
    }
  }, [draftId, entityUuid, getEntity, getEntityType, routeNamespace]);

  const refetch = useCallback(async () => {
    if (!routeNamespace || !draftEntitySubgraph) {
      return;
    }

    const entityId = entityIdFromComponents(
      routeNamespace.accountId as OwnedById,
      entityUuid,
      draftId,
    );

    const { data } = await getEntity(entityId);

    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntity.subgraph,
        )
      : undefined;

    setEntitySubgraphFromDb(subgraph);
    setDraftEntitySubgraph(subgraph);
  }, [draftEntitySubgraph, draftId, entityUuid, getEntity, routeNamespace]);

  const resetDraftState = () => {
    setIsDirty(false);
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);
  };

  const discardChanges = () => {
    resetDraftState();
    setDraftEntitySubgraph(entitySubgraphFromDb);
  };

  const [savingChanges, setSavingChanges] = useState(false);
  const handleSaveChanges = async (overrideProperties?: PropertyObject) => {
    if (!entitySubgraphFromDb || !draftEntitySubgraph) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      const entity = getRoots(entitySubgraphFromDb)[0];
      if (!entity) {
        throw new Error(`entity not found in subgraph`);
      }

      await applyDraftLinkEntityChanges(
        entity,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: draftEntity.metadata.recordId.entityId,
            entityTypeId: draftEntity.metadata.entityTypeId,
            propertyPatches: patchesFromPropertyObjects({
              oldProperties: entityFromDb?.properties ?? {},
              newProperties: mergePropertyObjectAndMetadata(
                overrideProperties ?? draftEntity.properties,
                undefined,
              ),
            }),
          },
        },
      });

      await refetch();
    } finally {
      setSavingChanges(false);
    }

    resetDraftState();
  };

  const onEntityUpdated = useCallback(
    (entity: Entity) => {
      if (!routeNamespace?.shortname) {
        return;
      }

      const { entityId } = entity.metadata.recordId;
      const latestDraftId = extractDraftIdFromEntityId(entityId);

      if (latestDraftId !== draftId) {
        /**
         * If the entity either no longer has a draftId when it did before,
         * or has a draftId when it didn't before,
         * we need to update the router params. This will trigger the effect which fetches the entity.
         */
        const entityHref = generateEntityPath({
          shortname: routeNamespace.shortname,
          entityId,
          includeDraftId: !!latestDraftId,
        });
        void router.replace(entityHref);
        return;
      }

      /**
       * If the entityId hasn't changed we can just refetch
       */
      void refetch();
    },
    [draftId, refetch, router, routeNamespace],
  );

  if (loading) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntitySubgraph) {
    return <PageErrorState />;
  }

  const draftEntity = getRoots(draftEntitySubgraph)[0];
  if (!draftEntity) {
    return <NextErrorComponent statusCode={404} />;
  }

  const entityLabel = generateEntityLabel(draftEntitySubgraph);
  const isModifyingEntity =
    isDirty || !!draftLinksToCreate.length || !!draftLinksToArchive.length;

  const isQueryEntity =
    draftEntity.metadata.entityTypeId ===
    blockProtocolEntityTypes.query.entityTypeId;

  return (
    <EntityEditorPage
      entity={entityFromDb}
      editBar={
        <EditBar
          visible={isModifyingEntity}
          discardButtonProps={{
            onClick: discardChanges,
          }}
          confirmButtonProps={{
            onClick: () => handleSaveChanges(),
            loading: savingChanges,
            children: "Save changes",
          }}
        />
      }
      isModifyingEntity={isModifyingEntity}
      handleSaveChanges={handleSaveChanges}
      entityLabel={entityLabel}
      entityUuid={entityUuid}
      owner={String(router.query.shortname)}
      isQueryEntity={isQueryEntity}
      isDirty={isDirty}
      draftLinksToCreate={draftLinksToCreate}
      setDraftLinksToCreate={setDraftLinksToCreate}
      draftLinksToArchive={draftLinksToArchive}
      setDraftLinksToArchive={setDraftLinksToArchive}
      entitySubgraph={draftEntitySubgraph}
      readonly={isReadOnly}
      onEntityUpdated={(entity) => onEntityUpdated(entity)}
      setEntity={(changedEntity) => {
        setIsDirty(true);
        updateEntitySubgraphStateByEntity(
          changedEntity,
          setDraftEntitySubgraph,
        );
      }}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
