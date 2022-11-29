import { validateVersionedUri } from "@blockprotocol/type-system-web";
import { useRouter } from "next/router";
import { useState } from "react";
import { useEffectOnceWhen } from "rooks";
import { useLoggedInUser } from "../../../components/hooks/useAuthenticatedUser";
import { PageErrorState } from "../../../components/page-error-state";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { NewEntityPage } from "./[entity-uuid].page/new-entity-page";
import { useCreateNewEntityAndRedirect } from "./[entity-uuid].page/shared/use-create-new-entity-and-redirect";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useLoggedInUser();
  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();
  const [loading, setLoading] = useState(true);

  const accountSlug = router.query["account-slug"] as string | undefined;
  const shortname = accountSlug?.slice(1);

  useEffectOnceWhen(() => {
    const init = async () => {
      const entityTypeId = String(router.query["entity-type-id"]);
      const idResult = validateVersionedUri(entityTypeId);

      if (idResult.type === "Ok") {
        try {
          await createNewEntityAndRedirect(idResult.inner);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    void init();
  }, !!authenticatedUser);

  if (!authenticatedUser) {
    return null;
  }

  if (loading) {
    return <EntityPageLoadingState />;
  }

  // show error if url slug it's not users shortname, or shortname of one of users orgs
  const atUsersNamespace = shortname === authenticatedUser?.shortname;
  const atOrgsNamespace = !!authenticatedUser?.memberOf.find(
    (val) => val.shortname === shortname,
  );

  if (!atOrgsNamespace && !atUsersNamespace) {
    return <PageErrorState />;
  }

  return <NewEntityPage />;
};

Page.getLayout = getPlainLayout;

export default Page;
