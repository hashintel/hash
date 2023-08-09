import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import OrgGeneralSettingsPage from "./general.page";

const OrgSettingsPage: NextPageWithLayout = () => {
  return <OrgGeneralSettingsPage />;
};

OrgSettingsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default OrgSettingsPage;
