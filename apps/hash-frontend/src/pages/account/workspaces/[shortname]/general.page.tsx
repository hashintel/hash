import { Container } from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";

import {
  getLayoutWithSidebar,
  NextPageWithLayout,
} from "../../../../shared/layout";
import { useAuthenticatedUser } from "../../../shared/auth-info-context";
import { OrgForm, OrgFormData } from "../../../shared/org-form";

const OrgGeneralSettingsPage: NextPageWithLayout = () => {
  const router = useRouter();

  const { shortname } = router.query as { shortname: string };

  const { authenticatedUser } = useAuthenticatedUser();

  const org = authenticatedUser.memberOf.find(
    (orgOption) => orgOption.shortname === shortname,
  );

  if (!org) {
    void router.push("/");
    return null;
  }

  const updateOrg = async (orgData: OrgFormData) => {
    console.log(orgData);
  };

  return (
    <>
      <NextSeo title={`${org.name} | Settings`} />

      <Container>
        <OrgForm
          org={org}
          onSubmit={updateOrg}
          submitLabel="Update public profile"
        />
      </Container>
    </>
  );
};

OrgGeneralSettingsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default OrgGeneralSettingsPage;
