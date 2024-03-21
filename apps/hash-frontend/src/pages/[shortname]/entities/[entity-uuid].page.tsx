import { useLazyQuery } from "@apollo/client";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/graph-queries";
import { getEntityQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { UserProperties } from "@local/hash-isomorphic-utils/system-types/shared";
import type {
  DraftId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityRootType,
  EntityUuid,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import {
  entityIdFromComponents,
  extractDraftIdFromEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import NextErrorComponent from "next/error";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { PageErrorState } from "../../../components/page-error-state";
import type {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../graphql/api-types.gen";
import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { generateEntityHref } from "../../shared/use-entity-href";
import { EditBar } from "../shared/edit-bar";
import { useRouteNamespace } from "../shared/use-route-namespace";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { updateEntitySubgraphStateByEntity } from "./[entity-uuid].page/shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./[entity-uuid].page/shared/use-draft-link-state";

/**
 * Get the desired entity from the subgraph.
 *
 * A subgraph at a single point in time may have multiple versions of the entity in one of the following combinations:
 * 1. Zero live versions (i.e. non-draft), and a single draft version – without a live entity, there is only a single draft series,
 *    because there cannot be multiple draft series without an existing live entity to base them on top of.
 * 2. One live version, and zero or more draft updates to that live version.
 *
 * In a subgraph requested for a time interval covering multiple points in time, there would potentially be multiple editions
 * of each of the series mentioned in the above combinations (e.g. many editions of a single live series, many editions of each update series).
 *
 * @returns If a specific draft is requested, it is returned, otherwise nothing is returned
 *          – we shouldn't return some other version of the entity, because requesting a draft that doesn't exist is a bug.
 *          If no specific draft is requested, the live version is returned if it exists, otherwise the single draft that should be present.
 */
const getEntityFromSubgraph = (
  subgraph: Subgraph<EntityRootType>,
  draftId?: string,
): Entity | undefined => {
  const entities = getRoots(subgraph);

  if (draftId) {
    return entities.find(
      (entity) =>
        extractDraftIdFromEntityId(entity.metadata.recordId.entityId) ===
        draftId,
    );
  }

  const liveVersion = entities.find(
    (entity) => !extractDraftIdFromEntityId(entity.metadata.recordId.entityId),
  );

  if (liveVersion) {
    return liveVersion;
  }

  if (entities.length === 1) {
    return entities[0];
  }

  throw new Error(
    "Multiple roots present in entity subgraph without a live series – only one draft entity should be present",
  );
};

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
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [entitySubgraphFromDb, setEntitySubgraphFromDb] =
    useState<Subgraph<EntityRootType>>();
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();
  const [isReadOnly, setIsReadOnly] = useState(true);

  const entityFromDb =
    entitySubgraphFromDb &&
    getEntityFromSubgraph(entitySubgraphFromDb, draftId);

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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
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
  const handleSaveChanges = async (
    overrideProperties?: EntityPropertiesObject,
  ) => {
    if (!entitySubgraphFromDb || !draftEntitySubgraph) {
      return;
    }

    const draftEntity = getEntityFromSubgraph(draftEntitySubgraph, draftId);

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      const entity = getEntityFromSubgraph(entitySubgraphFromDb, draftId);
      if (!entity) {
        throw new Error(`entity ${draftId} not found in subgraph`);
      }

      await applyDraftLinkEntityChanges(
        entity,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      /** @todo add validation here */
      await updateEntity({
        data: {
          entityId: draftEntity.metadata.recordId.entityId,
          entityTypeId: draftEntity.metadata.entityTypeId,
          properties: overrideProperties ?? draftEntity.properties,
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
        const entityHref = generateEntityHref({
          shortname: routeNamespace.shortname,
          entityId,
          includeDraftId: !!latestDraftId,
        });
        void router.push(entityHref);
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

  const draftEntity = getEntityFromSubgraph(draftEntitySubgraph, draftId);
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
