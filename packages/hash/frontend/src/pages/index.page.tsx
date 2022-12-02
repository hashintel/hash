import { useEffect } from "react";
import { useRouter } from "next/router";

import { useLoggedInUser } from "../components/hooks/useAuthenticatedUser";
import { NextPageWithLayout } from "../shared/layout";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { authenticatedUser } = useLoggedInUser();

  useEffect(() => {
    /**
     * @todo: this check could occur in a server-side render, so that a
     * redirect to the workspace or login page is done before rendering
     * this empty homepage.
     *
     * @see https://app.asana.com/0/1203179076056209/1203451531168818/f
     */
    if (authenticatedUser) {
      void router.replace(`/${authenticatedUser.userAccountId}`);
    }
  }, [router, authenticatedUser]);

  return null;
};

export default Page;
