import { useRouter } from "next/router";

import { getAdminLayout } from "./admin-page-layout";

import type { NextPageWithLayout } from "../../shared/layout";

const AdminHomePage: NextPageWithLayout = () => {
  const router = useRouter();

  void router.push("/admin/users");

  return null;
};

AdminHomePage.getLayout = (page) => getAdminLayout(page);

export default AdminHomePage;
