import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../../shared/layout";
import { getSettingsLayout } from "./shared/settings-layout";

const SettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  void router.push("/settings/organizations");

  return null;
};

SettingsPage.getLayout = (page) => getSettingsLayout(page);

export default SettingsPage;
