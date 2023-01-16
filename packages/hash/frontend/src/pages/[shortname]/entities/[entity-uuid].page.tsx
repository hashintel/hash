import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@hashintel/hash-shared/types";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
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
import { useRouteNamespace } from "../shared/use-route-namespace";
import { EditBar } from "../types/entity-type/[entity-type-id].page/edit-bar";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
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

  const [entitySubgraphFromDB, setEntitySubgraphFromDB] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();

  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  useEffect(() => {
    // set as dirty if draft link arrays are touched
    if (draftLinksToCreate.length || draftLinksToArchive.length) {
      setIsDirty(true);
    }
  }, [draftLinksToCreate, draftLinksToArchive]);

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
              setEntitySubgraphFromDB(subgraph);
              setDraftEntitySubgraph(subgraph);
            } catch {
              setEntitySubgraphFromDB(undefined);
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

    setEntitySubgraphFromDB(subgraph);
    setDraftEntitySubgraph(newDraftEntitySubgraph);
  };

  const resetDraftState = () => {
    setIsDirty(false);
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);
  };

  const discardChanges = () => {
    resetDraftState();
    setDraftEntitySubgraph(entitySubgraphFromDB);
  };

  const [savingChanges, setSavingChanges] = useState(false);
  const handleSaveChanges = async () => {
    if (!entitySubgraphFromDB || !draftEntitySubgraph) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      await applyDraftLinkEntityChanges(
        getRoots(entitySubgraphFromDB)[0]?.metadata.editionId
          .baseId! as EntityId,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      /** @todo add validation here */
      await updateEntity({
        data: {
          entityId: draftEntity.metadata.editionId.baseId as EntityId,
          updatedProperties: draftEntity.properties,
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

  return (
    <EntityEditorPage
      refetch={refetch}
      editBar={
        <EditBar
          visible={isDirty}
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
      entitySubgraph={draftEntitySubgraph}
      entityUuid={entityUuid}
      owner={String(router.query.shortname)}
      setEntity={(entity) => {
        setIsDirty(true);
        updateEntitySubgraphStateByEntity(entity, setDraftEntitySubgraph);
      }}
      draftLinksToCreate={draftLinksToCreate}
      setDraftLinksToCreate={setDraftLinksToCreate}
      draftLinksToArchive={draftLinksToArchive}
      setDraftLinksToArchive={setDraftLinksToArchive}
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
