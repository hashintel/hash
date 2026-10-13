import { AdminLayout } from "./admin-page-layout/admin-layout";

import type { ReactElement } from "react";

export const getAdminLayout = (page: ReactElement) => {
  return <AdminLayout>{page}</AdminLayout>;
};
