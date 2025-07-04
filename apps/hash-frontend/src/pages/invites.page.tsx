import { BellLightIcon } from "@hashintel/design-system";
import {
  breadcrumbsClasses,
  buttonClasses,
  Container,
  Typography,
} from "@mui/material";
import { NextSeo } from "next-seo";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { InvitesTable } from "./invites.page/invites-table";
import { TopContextBar } from "./shared/top-context-bar";

const InvitesPage: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo title="Invites" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Invites",
            id: "Invites",
            icon: <BellLightIcon />,
          },
        ]}
        sx={{
          background: "transparent",
          [`.${breadcrumbsClasses.ol} .${buttonClasses.root}`]: {
            background: "transparent",
            borderColor: "transparent",
          },
        }}
      />
      <Container sx={{ paddingY: 6 }}>
        <Typography variant="h5" sx={{ marginBottom: 4 }}>
          Organization invitations
        </Typography>
        <InvitesTable />
      </Container>
    </>
  );
};

InvitesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default InvitesPage;
