import { useRouter } from "next/router";
import { useMemo } from "react";
import { useQuery } from "@apollo/client";
import { Stack } from "@mui/material";

import type { HasAccessToHashQuery } from "../graphql/api-types.gen";
import { hasAccessToHashQuery } from "../graphql/queries/user.queries";
import type { getLayoutWithSidebar,NextPageWithLayout  } from "../shared/layout";

import { LoggedIn } from "./index.page/logged-in";
import { LoggedOut } from "./index.page/logged-out";
import { Waitlisted } from "./index.page/waitlisted";
import { useAuthInfo } from "./shared/auth-info-context";

const Page: NextPageWithLayout = () => {
  const { authenticatedUser } = useAuthInfo();
  const { data: hasAccessToHashResponse } = useQuery<HasAccessToHashQuery>(
    hasAccessToHashQuery,
    { skip: !authenticatedUser || authenticatedUser.accountSignupComplete },
  );

  const { push } = useRouter();

  const hasAccessToHash = useMemo(() => {
    if (authenticatedUser?.accountSignupComplete) {
      return true;
    }
 
      return hasAccessToHashResponse?.hasAccessToHash;
    
  }, [authenticatedUser, hasAccessToHashResponse]);

  if (!authenticatedUser?.accountSignupComplete) {
    if (hasAccessToHash) {
      void push("/signup");

      return null;
    }

    return (
      <Stack alignItems={"center"}>
        {authenticatedUser ? <Waitlisted /> : <LoggedOut />}
      </Stack>
    );
  }

  return (
    <Stack alignItems={"center"}>
      <LoggedIn />
    </Stack>
  );
};

Page.getLayout = (page) =>
  getLayoutWithSidebar(page, { grayBackground: false, fullWidth: true });

export default Page;
