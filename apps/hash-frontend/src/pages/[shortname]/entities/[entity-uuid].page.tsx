import { useLazyQuery } from "@apollo/client";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-graphql-shared/graphql/types";
import { getEntityQuery } from "@local/hash-graphql-shared/queries/entity.queries";
import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityPropertiesObject,
  EntityRootType,
  EntityUuid,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import NextErrorComponent from "next/error";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { PageErrorState } from "../../../components/page-error-state";
import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../graphql/api-types.gen";
import { generateEntityLabel } from "../../../lib/entities";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { EditBar } from "../shared/edit-bar";
import { useRouteNamespace } from "../shared/use-route-namespace";
import { QUERY_ENTITY_TYPE_ID } from "./[entity-uuid].page/create-entity-page";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { updateEntitySubgraphStateByEntity } from "./[entity-uuid].page/shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./[entity-uuid].page/shared/use-draft-link-state";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
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
    entitySubgraphFromDb && getRoots(entitySubgraphFromDb)[0];

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
        },
      }),
    [lazyGetEntity],
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
          const entityId = entityIdFromOwnedByIdAndEntityUuid(
            routeNamespace.accountId as OwnedById,
            entityUuid,
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
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- false positive on unsafe index access
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
  }, [entityUuid, getEntity, getEntityType, routeNamespace]);

  const refetch = async () => {
    if (!routeNamespace || !draftEntitySubgraph) {
      return;
    }

    const entityId = entityIdFromOwnedByIdAndEntityUuid(
      routeNamespace.accountId as OwnedById,
      entityUuid,
    );

    const { data } = await getEntity(entityId);

    const subgraph = data
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntity.subgraph,
        )
      : undefined;

    setEntitySubgraphFromDb(subgraph);
    setDraftEntitySubgraph(subgraph);
  };

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

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      await applyDraftLinkEntityChanges(
        getRoots(entitySubgraphFromDb)[0]?.metadata.recordId
          .entityId as EntityId,
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
  const showEditBar =
    isDirty || !!draftLinksToCreate.length || !!draftLinksToArchive.length;

  const isQueryEntity =
    draftEntity.metadata.entityTypeId === QUERY_ENTITY_TYPE_ID;

  return (
    <EntityEditorPage
      entity={entityFromDb}
      editBar={
        <EditBar
          visible={showEditBar}
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
      replaceWithLatestDbVersion={refetch}
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
