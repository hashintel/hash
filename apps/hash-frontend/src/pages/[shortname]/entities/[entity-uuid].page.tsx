import { useLazyQuery } from "@apollo/client";
import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityPropertiesObject,
  EntityRootType,
  EntityUuid,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { PageErrorState } from "../../../components/page-error-state";
import {
  GetEntityQuery,
  GetEntityQueryVariables,
} from "../../../graphql/api-types.gen";
import { getEntityQuery } from "../../../graphql/queries/knowledge/entity.queries";
import { generateEntityLabel } from "../../../lib/entities";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { useIsReadonlyModeForResource } from "../../../shared/readonly-mode";
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
  );
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [entitySubgraphFromDb, setEntitySubgraphFromDb] =
    useState<Subgraph<EntityRootType>>();
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<EntityRootType>>();

  const entityFromDb =
    entitySubgraphFromDb && getRoots(entitySubgraphFromDb)[0];

  const entityOwnedById =
    entityFromDb &&
    extractOwnedByIdFromEntityId(entityFromDb.metadata.recordId.entityId);

  const readonly = useIsReadonlyModeForResource(entityOwnedById);

  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  const getEntity = useCallback(
    (accountId: OwnedById) =>
      lazyGetEntity({
        variables: {
          entityId: entityIdFromOwnedByIdAndEntityUuid(accountId, entityUuid),
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
    [entityUuid, lazyGetEntity],
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
          const { data } = await getEntity(
            routeNamespace.accountId as OwnedById,
          );

          const subgraph = data?.getEntity.subgraph;

          if (data?.getEntity) {
            try {
              setEntitySubgraphFromDb(subgraph as Subgraph<EntityRootType>);
              setDraftEntitySubgraph(subgraph as Subgraph<EntityRootType>);
            } catch {
              setEntitySubgraphFromDb(undefined);
              setDraftEntitySubgraph(undefined);
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

    const { data } = await getEntity(routeNamespace.accountId as OwnedById);

    const subgraph = data?.getEntity.subgraph;

    if (!subgraph) {
      return;
    }

    setEntitySubgraphFromDb(subgraph as Subgraph<EntityRootType>);
    setDraftEntitySubgraph(subgraph as Subgraph<EntityRootType>);
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

  const entityLabel = generateEntityLabel(draftEntitySubgraph);
  const showEditBar =
    isDirty || !!draftLinksToCreate.length || !!draftLinksToArchive.length;

  const draftEntity = getRoots(draftEntitySubgraph)[0];
  const isQueryEntity =
    draftEntity?.metadata.entityTypeId === QUERY_ENTITY_TYPE_ID;

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
      readonly={readonly}
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
