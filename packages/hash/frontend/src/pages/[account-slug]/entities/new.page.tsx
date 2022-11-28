import { useRouter } from "next/router";
import { useState } from "react";
import { useEffectOnceWhen } from "rooks";
import { useLoggedInUser } from "../../../components/hooks/useAuthenticatedUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { mustBeVersionedUri } from "../types/entity-type/util";
import { EntityPageLoadingState } from "./[entity-uuid].page/entity-page-loading-state";
import { NewEntityPage } from "./[entity-uuid].page/new-entity-page";
import { useCreateNewEntityAndRedirect } from "./[entity-uuid].page/shared/use-create-new-entity-and-redirect";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useLoggedInUser();
  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();
  const [loading, setLoading] = useState(false);

  useEffectOnceWhen(() => {
    const init = async () => {
      const entityTypeId = router.query["entity-type-id"] as string | undefined;

      if (entityTypeId) {
        try {
          setLoading(true);
          await createNewEntityAndRedirect(mustBeVersionedUri(entityTypeId));
        } finally {
          setLoading(false);
        }
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

  return <NewEntityPage />;
};

Page.getLayout = getPlainLayout;

export default Page;
