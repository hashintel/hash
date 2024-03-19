import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../../shared/layout";
import { getAdminLayout } from "./admin-page-layout";

const AdminHomePage: NextPageWithLayout = () => {
  const router = useRouter();

  void router.push("/admin/users");

  return null;
};

AdminHomePage.getLayout = (page) => getAdminLayout(page);

export default AdminHomePage;
