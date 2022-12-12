import { validateVersionedUri } from "@blockprotocol/type-system";
import { useRouter } from "next/router";
import { useContext, useEffect, useState } from "react";
import { PageErrorState } from "../../components/page-error-state";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { EntityPageLoadingState } from "../[account-slug]/entities/[entity-uuid].page/entity-page-loading-state";
import { NewEntityPage } from "../[account-slug]/entities/[entity-uuid].page/new-entity-page";
import { useCreateNewEntityAndRedirect } from "../[account-slug]/entities/[entity-uuid].page/shared/use-create-new-entity-and-redirect";
import { WorkspaceContext } from "../shared/workspace-context";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();
  const loadingTypeSystem = useInitTypeSystem();
  const queryEntityId = router.query["entity-type-id"]?.toString();
  const entityTypeId =
    loadingTypeSystem || !queryEntityId
      ? null
      : validateVersionedUri(queryEntityId);
  const { activeWorkspace } = useContext(WorkspaceContext);
  const shouldBeCreatingEntity = entityTypeId?.type === "Ok";
  const [creatingEntity, setCreatingEntity] = useState(shouldBeCreatingEntity);

  const entityTypeInvalid = !!queryEntityId && entityTypeId?.type === "Err";

  if (shouldBeCreatingEntity && !creatingEntity) {
    setCreatingEntity(true);
  } else if (entityTypeInvalid && creatingEntity) {
    setCreatingEntity(false);
  }

  /**
   * This shouldn't be an effect, because we're relying on React re-renders after
   * events, instead of just subscribing to the events. It's difficult to do that
   * right now because the different pieces are stored in different places. We
   * should have one component responsible for fetching user data and storing it
   * in context, and which will also let child components subscribe to
   * authenticatedUser becoming available
   *
   * @todo remove this effect when possible
   */
  useEffect(() => {
    if (entityTypeId?.type === "Ok") {
      const controller = new AbortController();

      void createNewEntityAndRedirect(
        entityTypeId.inner,
        true,
        controller.signal,
      );

      return () => {
        controller.abort();
      };
    }
  }, [createNewEntityAndRedirect, entityTypeId?.inner, entityTypeId?.type]);

  if (creatingEntity || !activeWorkspace || loadingTypeSystem) {
    return <EntityPageLoadingState />;
  }

  if (entityTypeInvalid) {
    return <PageErrorState />;
  }

  return <NewEntityPage />;
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
