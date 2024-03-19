import { NextSeo } from "next-seo";

import type { NextPageWithLayout } from "../../../../shared/layout";
import { getSettingsLayout } from "../../../shared/settings-layout";
import { SettingsPageContainer } from "../../shared/settings-page-container";
import { CreateOrgForm } from "./index.page/create-org-form";

const Page: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo title="Create Organization" />

      <SettingsPageContainer heading={<>Create new organization</>}>
        <CreateOrgForm />
      </SettingsPageContainer>
    </>
  );
};

Page.getLayout = (page) => getSettingsLayout(page);

export default Page;
