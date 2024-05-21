import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import type { HasAccessToHashQuery } from "../graphql/api-types.gen";
import { hasAccessToHashQuery } from "../graphql/queries/user.queries";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { LoggedOut } from "./index.page/logged-out";
import { Waitlisted } from "./index.page/waitlisted";
import { useAuthInfo } from "./shared/auth-info-context";

const Page: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthInfo();
  const { data: hasAccessToHashResponse } = useQuery<HasAccessToHashQuery>(
    hasAccessToHashQuery,
    { skip: !authenticatedUser || authenticatedUser.accountSignupComplete },
  );

  const hasAccessToHash = useMemo(() => {
    if (authenticatedUser?.accountSignupComplete) {
      return true;
    } else {
      return hasAccessToHashResponse?.hasAccessToHash;
    }
  }, [authenticatedUser, hasAccessToHashResponse]);

  return hasAccessToHash ? <LoggedOut /> : <Waitlisted />;
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, { grayBackground: false, fullWidth: true });

export default Page;
