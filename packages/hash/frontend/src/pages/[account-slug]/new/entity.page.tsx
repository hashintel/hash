import { validateVersionedUri } from "@blockprotocol/type-system-web";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { useAuthenticatedUser } from "../../../components/hooks/useAuthenticatedUser";
import { PageErrorState } from "../../../components/page-error-state";
import { useInitTypeSystem } from "../../../lib/use-init-type-system";
import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../shared/layout";
import { EntityPageLoadingState } from "../entities/[entity-uuid].page/entity-page-loading-state";
import { NewEntityPage } from "../entities/[entity-uuid].page/new-entity-page";
import { useCreateNewEntityAndRedirect } from "../entities/[entity-uuid].page/shared/use-create-new-entity-and-redirect";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();
  const loadingTypeSystem = useInitTypeSystem();
  const queryEntityId = router.query["entity-type-id"]?.toString();
  const entityTypeId =
    loadingTypeSystem || !queryEntityId
      ? null
      : validateVersionedUri(queryEntityId);
  const { authenticatedUser, loading: authenticatedUserLoading } =
    useAuthenticatedUser(undefined, true);
  const shouldBeCreatingEntity = entityTypeId?.type === "Ok";
  const [creatingEntity, setCreatingEntity] = useState(shouldBeCreatingEntity);

  const entityIdInvalid = !!queryEntityId && entityTypeId?.type === "Err";

  if (shouldBeCreatingEntity && !creatingEntity) {
    setCreatingEntity(true);
  } else if (entityIdInvalid && creatingEntity) {
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
    if (entityTypeId?.type === "Ok" && authenticatedUser) {
      const controller = new AbortController();

      void createNewEntityAndRedirect(
        authenticatedUser,
        entityTypeId.inner,
        true,
        controller.signal,
      );

      return () => {
        controller.abort();
      };
    }
  }, [
    authenticatedUser,
    createNewEntityAndRedirect,
    entityTypeId?.inner,
    entityTypeId?.type,
  ]);

  const accountSlug = router.query["account-slug"] as string | undefined;
  const shortname = accountSlug?.slice(1);

  if (creatingEntity || authenticatedUserLoading || loadingTypeSystem) {
    return <EntityPageLoadingState />;
  }

  if (!authenticatedUser) {
    return null;
  }

  // show error if url slug it's not users shortname, or shortname of one of users orgs
  const atUsersNamespace = shortname === authenticatedUser.shortname;
  const atOrgsNamespace = authenticatedUser.memberOf.some(
    (val) => val.shortname === shortname,
  );

  if ((!atOrgsNamespace && !atUsersNamespace) || entityIdInvalid) {
    return <PageErrorState />;
  }

  return <NewEntityPage />;
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
