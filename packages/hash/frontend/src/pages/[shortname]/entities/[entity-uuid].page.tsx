import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import {
  EntityId,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  OwnedById,
} from "@hashintel/hash-shared/types";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import produce from "immer";
import { useBlockProtocolGetEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolGetEntity";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { PageErrorState } from "../../../components/page-error-state";
import { generateEntityLabel } from "../../../lib/entities";
import { useRouteNamespace } from "../shared/use-route-namespace";
import { useBlockProtocolGetEntityType } from "../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { useBlockProtocolUpdateEntity } from "../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolUpdateEntity";
import { useLoadingCallback } from "../../../components/hooks/useLoadingCallback";
import { EditBarReusable } from "../types/entity-type/[entity-type-id].page/edit-bar-reusable";
import { EntityEditorPage } from "./[entity-uuid].page/entity-editor-page";
import { updateEntitySubgraphStateByEntity } from "./[entity-uuid].page/shared/update-entity-subgraph-state-by-entity";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const entityUuid = router.query["entity-uuid"] as EntityUuid;
  const { routeNamespace } = useRouteNamespace();
  const { getEntity } = useBlockProtocolGetEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  const [entitySubgraphFromDB, setEntitySubgraphFromDB] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();
  const [draftEntitySubgraph, setDraftEntitySubgraph] =
    useState<Subgraph<SubgraphRootTypes["entity"]>>();

  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);

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

    setEntitySubgraphFromDB(subgraph);

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

    setDraftEntitySubgraph(newDraftEntitySubgraph);
  };

  const discardChanges = () => {
    setIsDirty(false);
    setDraftEntitySubgraph(entitySubgraphFromDB);
  };

  const [handleSaveChanges, savingChanges] = useLoadingCallback(async () => {
    if (!entitySubgraphFromDB || !draftEntitySubgraph) {
      return;
    }

    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    /** @todo add validation here */
    await updateEntity({
      data: {
        entityId: draftEntity.metadata.editionId.baseId as EntityId,
        updatedProperties: draftEntity.properties,
      },
    });
    setIsDirty(false);
  });

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
        <EditBarReusable
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
    />
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default Page;
