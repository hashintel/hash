import { useEffect } from "react";
import { useRouter } from "next/router";

import { useLoggedInUser } from "../components/hooks/useAuthenticatedUser";
import { NextPageWithLayout } from "../shared/layout";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser, loading, kratosSession } = useLoggedInUser();

  useEffect(() => {
    /**
     * @todo: this check could occur in a server-side render, so that a
     * redirect to the workspace or login page is done before rendering
     * this empty homepage.
     */
    if (authenticatedUser) {
      void router.push(`/${authenticatedUser.userAccountId}`);
    }
  }, [router, authenticatedUser, kratosSession, loading]);

  return null;
};

export default Page;
