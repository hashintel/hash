import { useLazyQuery, useMutation } from "@apollo/client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import {
  getClosedMultiEntityTypeFromMap,
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
import {
  currentTimeInstantTemporalAxes,
  generateEntityIdFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
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
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { EditBar } from "../shared/edit-bar";
import { useRouteNamespace } from "../shared/use-route-namespace";
import type { EntityEditorProps } from "./[entity-uuid].page/entity-editor";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { createDraftEntitySubgraph } from "./[entity-uuid].page/shared/create-draft-entity-subgraph";
import { useApplyDraftLinkEntityChanges } from "./[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./[entity-uuid].page/shared/use-draft-link-state";
import { useHandleTypeChanges } from "./[entity-uuid].page/shared/use-handle-type-changes";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
  const draftId = router.query.draftId as DraftId | undefined;

  const { routeNamespace } = useRouteNamespace();

  const [lazyGetEntity] = useLazyQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, { fetchPolicy: "cache-and-network" });
  const { getEntityType } = useBlockProtocolGetEntityType();

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [draftEntityTypesDetails, setDraftEntityTypesDetails] =
    useState<
      Pick<
        EntityEditorProps,
        "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
      >
    >();

  const [dataFromDb, setDataFromDb] =
    useState<
      Pick<
        EntityEditorProps,
        | "closedMultiEntityType"
        | "closedMultiEntityTypesDefinitions"
        | "closedMultiEntityTypesMap"
        | "entitySubgraph"
      >
    >();

  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  const handleTypeChanges = useHandleTypeChanges({
    entitySubgraph: draftEntitySubgraph,
    setDraftEntityTypesDetails,
    setDraftEntitySubgraph,
    setDraftLinksToArchive,
  });

  const [isReadOnly, setIsReadOnly] = useState(true);

  const entityFromDb =
    dataFromDb?.entitySubgraph && getRoots(dataFromDb.entitySubgraph)[0];

  /**
   * If the user is viewing a `User` entity, redirect to its profile page.
   *
   * @todo: reconsider this once we have property level permissions, where
   * we can prevent users from directly modifying specific user entity properties.
   */
  useEffect(() => {
    if (
      entityFromDb &&
      entityFromDb.metadata.entityTypeIds.some(
        (entityTypeId) =>
          extractBaseUrl(entityTypeId) ===
          systemEntityTypes.user.entityTypeBaseUrl,
      )
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
          includePermissions: true,
          request: {
            filter: generateEntityIdFilter({ entityId, includeArchived: true }),
            graphResolveDepths: {
              ...zeroedGraphResolveDepths,
              isOfType: { outgoing: 1 },
              hasLeftEntity: { outgoing: 1, incoming: 1 },
              hasRightEntity: { outgoing: 1, incoming: 1 },
            },
            includeEntityTypes: "resolved",
            includeDrafts: !!draftId,
            temporalAxes: currentTimeInstantTemporalAxes,
          },
        },
      }),
    [draftId, lazyGetEntity],
  );

  const setStateFromGetEntityResponse = useCallback(
    (data?: GetEntitySubgraphQuery) => {
      if (data?.getEntitySubgraph) {
        const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntitySubgraph.subgraph,
        );

        try {
          const { closedMultiEntityTypes, definitions } =
            data.getEntitySubgraph;

          if (!closedMultiEntityTypes || !definitions) {
            throw new Error(
              "closedMultiEntityTypes and definitions are required",
            );
          }

          const entity = getRoots(subgraph)[0];

          if (!entity) {
            throw new Error("No root entity found in entity subgraph");
          }

          const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
            closedMultiEntityTypes,
            entity.metadata.entityTypeIds,
          );

          setDataFromDb({
            closedMultiEntityTypesMap: closedMultiEntityTypes,
            closedMultiEntityType,
            closedMultiEntityTypesDefinitions: definitions,
            entitySubgraph: subgraph,
          });

          setDraftEntityTypesDetails({
            closedMultiEntityType,
            closedMultiEntityTypesDefinitions: definitions,
          });
          setDraftEntitySubgraph(subgraph);
          setIsReadOnly(
            !data.getEntitySubgraph.userPermissionsOnEntities?.[entity.entityId]
              ?.edit,
          );
        } catch {
          setDataFromDb(undefined);
          setDraftEntitySubgraph(undefined);
          setIsReadOnly(true);
        }
      }
    },
    [],
  );

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

          setStateFromGetEntityResponse(data);
        } finally {
          setLoading(false);
        }
      };

      void init();
    }
  }, [
    draftId,
    entityUuid,
    getEntity,
    getEntityType,
    routeNamespace,
    setStateFromGetEntityResponse,
  ]);

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

    setStateFromGetEntityResponse(data);
  }, [
    draftEntitySubgraph,
    draftId,
    entityUuid,
    getEntity,
    routeNamespace,
    setStateFromGetEntityResponse,
  ]);

  const resetDraftState = () => {
    setIsDirty(false);
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);
  };

  const discardChanges = () => {
    resetDraftState();

    const {
      entitySubgraph,
      closedMultiEntityType,
      closedMultiEntityTypesDefinitions,
    } = dataFromDb ?? {};

    setDraftEntityTypesDetails(
      closedMultiEntityType && closedMultiEntityTypesDefinitions
        ? {
            closedMultiEntityType,
            closedMultiEntityTypesDefinitions,
          }
        : undefined,
    );
    setDraftEntitySubgraph(entitySubgraph);
  };

  const [savingChanges, setSavingChanges] = useState(false);
  const handleSaveChanges = async (overrideProperties?: PropertyObject) => {
    if (!dataFromDb || !draftEntitySubgraph) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      const entity = getRoots(dataFromDb.entitySubgraph)[0];
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
            entityTypeIds: draftEntity.metadata.entityTypeIds,
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

  if (loading || !draftEntityTypesDetails) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntitySubgraph) {
    return <PageErrorState />;
  }

  const draftEntity = getRoots(draftEntitySubgraph)[0];
  if (!draftEntity) {
    return <NextErrorComponent statusCode={404} />;
  }

  const entityLabel = generateEntityLabel(
    draftEntityTypesDetails.closedMultiEntityType,
    draftEntity,
  );
  const isModifyingEntity =
    isDirty || !!draftLinksToCreate.length || !!draftLinksToArchive.length;

  const isQueryEntity = draftEntity.metadata.entityTypeIds.includes(
    blockProtocolEntityTypes.query.entityTypeId,
  );

  return (
    <EntityEditorPage
      entity={entityFromDb}
      closedMultiEntityTypesMap={dataFromDb?.closedMultiEntityTypesMap ?? null}
      {...draftEntityTypesDetails}
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
      handleTypesChange={async (change) => {
        await handleTypeChanges(change);

        setIsDirty(
          JSON.stringify(change.entityTypeIds.toSorted()) !==
            JSON.stringify(entityFromDb?.metadata.entityTypeIds.toSorted()),
        );
      }}
      setEntity={(changedEntity) => {
        setDraftEntitySubgraph((prev) =>
          createDraftEntitySubgraph({
            entity: changedEntity,
            entityTypeIds: changedEntity.metadata.entityTypeIds,
            currentSubgraph: prev,
            omitProperties: [],
          }),
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
