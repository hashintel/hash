import { useRouter } from "next/router";

import { NextPageWithLayout } from "../../../../shared/layout";
import { getSettingsLayout } from "../../shared/settings-layout";
import OrgGeneralSettingsPage from "./general.page";

const OrgSettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  void router.push(`${router.asPath}/general`, undefined, { shallow: true });
  return <OrgGeneralSettingsPage />;
};

OrgSettingsPage.getLayout = (page) => getSettingsLayout(page);
export default OrgSettingsPage;
