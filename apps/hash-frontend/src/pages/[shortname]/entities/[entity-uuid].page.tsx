import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityRootType,
  EntityUuid,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import produce from "immer";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import { useBlockProtocolGetEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-get-entity-type";
import { PageErrorState } from "../../../components/page-error-state";
import { generateEntityLabel } from "../../../lib/entities";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { useIsReadonlyModeForResource } from "../../../shared/readonly-mode";
import { useRouteNamespace } from "../shared/use-route-namespace";
import { EditBar } from "../types/entity-type/[...slug-maybe-version].page/shared/edit-bar";
import {
  QUERY_ENTITY_TYPE_ID,
  QUERY_PROPERTY_TYPE_BASE_URL,
} from "./[entity-uuid].page/create-entity-page";
import { EntityEditorProps } from "./[entity-uuid].page/entity-editor";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { QueryEditorPage } from "./[entity-uuid].page/query-editor-page";
import { updateEntitySubgraphStateByEntity } from "./[entity-uuid].page/shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./[entity-uuid].page/shared/use-draft-link-state";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
  const { routeNamespace } = useRouteNamespace();
  const { getEntity } = useBlockProtocolGetEntity();
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
          const { data: subgraph } = await getEntity({
            data: {
              entityId: entityIdFromOwnedByIdAndEntityUuid(
                routeNamespace.accountId as OwnedById,
                entityUuid,
              ),
            },
          });

          if (subgraph) {
            try {
              setEntitySubgraphFromDb(subgraph);
              setDraftEntitySubgraph(subgraph);
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

    const { data: subgraph } = await getEntity({
      data: {
        entityId: entityIdFromOwnedByIdAndEntityUuid(
          routeNamespace.accountId as OwnedById,
          entityUuid,
        ),
      },
    });

    if (!subgraph) {
      return;
    }

    const newDraftEntitySubgraph = produce(subgraph, (val) => {
      /** @see https://github.com/immerjs/immer/issues/839 for ts-ignore reason */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      const entityToUpdate = getRoots(val)[0];
      const draftEntity = getRoots(draftEntitySubgraph)[0];

      if (entityToUpdate && draftEntity && "properties" in entityToUpdate) {
        entityToUpdate.properties = draftEntity.properties;
      }
    });

    setEntitySubgraphFromDb(subgraph);
    setDraftEntitySubgraph(newDraftEntitySubgraph);
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
  const handleSaveChanges = async (overrideProperties: any) => {
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
  const shouldShowQueryEditor =
    draftEntity?.metadata.entityTypeId === QUERY_ENTITY_TYPE_ID;

  const entityEditorProps: EntityEditorProps = {
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
    entitySubgraph: draftEntitySubgraph,
    readonly,
    refetch,
    setEntity: (changedEntity) => {
      setIsDirty(true);
      updateEntitySubgraphStateByEntity(changedEntity, setDraftEntitySubgraph);
    },
  };

  if (shouldShowQueryEditor) {
    return (
      <QueryEditorPage
        handleSaveQuery={async (value) => {
          const properties = {
            [QUERY_PROPERTY_TYPE_BASE_URL]: value,
          };

          await handleSaveChanges(properties);
        }}
        entityLabel={entityLabel}
        entityUuid={entityUuid}
        owner={String(router.query.shortname)}
        mode="edit"
        {...entityEditorProps}
      />
    );
  }

  return (
    <EntityEditorPage
      editBar={
        <EditBar
          visible={showEditBar}
          discardButtonProps={{
            onClick: discardChanges,
          }}
          confirmButtonProps={{
            onClick: handleSaveChanges,
            loading: savingChanges,
            children: "Save changes",
          }}
        />
      }
      entityLabel={entityLabel}
      entityUuid={entityUuid}
      owner={String(router.query.shortname)}
      {...entityEditorProps}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
