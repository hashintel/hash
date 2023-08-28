import { NextSeo } from "next-seo";

import { NextPageWithLayout } from "../../../../shared/layout";
import { getSettingsLayout } from "../../shared/settings-layout";
import { OrgSettingsContainer } from "../shared/org-settings-container";
import { CreateOrgForm } from "./index.page/create-org-form";

const Page: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo title="Create Organization" />

      <OrgSettingsContainer header={<>Create new organization</>}>
        <CreateOrgForm />
      </OrgSettingsContainer>
    </>
  );
};

Page.getLayout = (page) => getSettingsLayout(page);

export default Page;
