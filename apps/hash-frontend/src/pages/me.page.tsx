import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { useAuthInfo } from "./shared/auth-info-context";

const MePage: NextPageWithLayout = () => {
  const router = useRouter();

  const { authenticatedUser } = useAuthInfo();

  if (authenticatedUser) {
    void router.push(`/@${authenticatedUser.shortname}`);
  } else {
    void router.push("/signin?return_to=/me");
  }

  return null;
};

MePage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default MePage;
