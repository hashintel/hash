import { Container } from "@mui/material";
import Head from "next/head";
import { useRouter } from "next/router";

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

  console.log({ authenticatedUser });

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
      <Head>
        {/* @todo this competes with the title in PlainLayout – fix that (use next-seo?) */}
        <title>{org.name} | Settings | General</title>
      </Head>
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
