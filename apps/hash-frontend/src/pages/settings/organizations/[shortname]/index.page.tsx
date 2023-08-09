import { NextPageWithLayout } from "../../../../shared/layout";
import { getSettingsLayout } from "../../shared/settings-layout";
import OrgGeneralSettingsPage from "./general.page";

const OrgSettingsPage: NextPageWithLayout = () => {
  return <OrgGeneralSettingsPage />;
};

OrgSettingsPage.getLayout = (page) => getSettingsLayout(page);
export default OrgSettingsPage;
