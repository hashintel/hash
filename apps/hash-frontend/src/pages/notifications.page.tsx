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
import { NotificationsTable } from "./notifications.page/notifications-table";
import { NotificationsWithLinksContextProvider } from "./shared/notifications-with-links-context";
import { TopContextBar } from "./shared/top-context-bar";

const NotificationsPage: NextPageWithLayout = () => {
  return (
    <>
      <NextSeo title="Notifications" />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: "Notifications",
            id: "notifications",
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
          Notifications
        </Typography>
        <NotificationsWithLinksContextProvider>
          <NotificationsTable />
        </NotificationsWithLinksContextProvider>
      </Container>
    </>
  );
};

NotificationsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default NotificationsPage;
