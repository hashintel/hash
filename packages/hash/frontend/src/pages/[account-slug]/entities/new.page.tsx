import { useRouter } from "next/router";
import { useState } from "react";
import { useEffectOnceWhen } from "rooks";
import { useLoggedInUser } from "../../../components/hooks/useAuthenticatedUser";
import { getPlainLayout, NextPageWithLayout } from "../../../shared/layout";
import { EntityPageLoadingState } from "./[entity-id].page/entity-page-loading-state";
import { NewEntityPage } from "./[entity-id].page/new-entity-page";
import { useCreateNewEntityAndRedirect } from "./[entity-id].page/shared/use-create-new-entity-and-redirect";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useLoggedInUser();
  const createNewEntityAndRedirect = useCreateNewEntityAndRedirect();
  const [loading, setLoading] = useState(false);

  useEffectOnceWhen(() => {
    const init = async () => {
      const entityTypeId = router.query["entity-type-id"] as string;

      if (entityTypeId) {
        try {
          setLoading(true);
          await createNewEntityAndRedirect({ entityTypeId });
        } finally {
          setLoading(false);
        }
      }
    };

    void init();
  }, !!createNewEntityAndRedirect);

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
