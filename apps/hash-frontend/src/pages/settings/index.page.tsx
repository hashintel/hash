import { useRouter } from "next/router";

import { getSettingsLayout } from "../shared/settings-layout";

import type { NextPageWithLayout } from "../../shared/layout";

const SettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  void router.push("/settings/organizations");

  return null;
};

SettingsPage.getLayout = (page) => getSettingsLayout(page);

export default SettingsPage;
