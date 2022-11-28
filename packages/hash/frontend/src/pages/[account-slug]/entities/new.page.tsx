import { useRouter } from "next/router";
import { useState } from "react";
import { useEffectOnceWhen } from "rooks";
import { useLoggedInUser } from "../../../components/hooks/useAuthenticatedUser";
import { PageErrorState } from "../../../components/page-error-state";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { mustBeVersionedUri } from "../types/entity-type/util";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { NewEntityPage } from "./[entity-uuid].page/new-entity-page";
import { useCreateNewEntityAndRedirect } from "./[entity-uuid].page/shared/use-create-new-entity-and-redirect";

type PageState = "error" | "loading" | "ready";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useLoggedInUser();
  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();
  const [pageState, setPageState] = useState<PageState>("loading");

  useEffectOnceWhen(() => {
    const init = async () => {
      // show error if url slug it's not users shortname, or shortname of one of users orgs
      const accountSlug = router.query["account-slug"] as string | undefined;
      const shortname = accountSlug?.split("@")[1];

      const atUsersNamespace = shortname === authenticatedUser?.shortname;
      const atOrgsNamespace = !!authenticatedUser?.memberOf.find(
        (val) => val.shortname === shortname,
      );

      if (!atOrgsNamespace && !atUsersNamespace) {
        return setPageState("error");
      }

      const entityTypeId = router.query["entity-type-id"] as string | undefined;

      if (entityTypeId) {
        try {
          await createNewEntityAndRedirect(mustBeVersionedUri(entityTypeId));
        } finally {
          setPageState("ready");
        }
      } else {
        setPageState("ready");
      }
    };

    void init();
  }, !!authenticatedUser);

  if (!authenticatedUser) {
    return null;
  }

  if (pageState === "loading") {
    return <EntityPageLoadingState />;
  }

  if (pageState === "error") {
    return <PageErrorState />;
  }

  return <NewEntityPage />;
};

Page.getLayout = getPlainLayout;

export default Page;
